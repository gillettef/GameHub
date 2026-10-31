// 로컬 AI 대전: 엔진을 직접 호출하고, AI 차례는 잠깐씩 쉬며 진행, 매 행동 자동 저장
import { createGame } from '../core/engine/setup';
import { applyAction } from '../core/engine/turn';
import { chooseAction, fallbackAction } from '../core/ai';
import type { Action, GameState } from '../core/types';
import { maskFor } from '../core/mask';
import { storage } from './storage';
import { useApp } from './app';

const AI_DELAY = 450;
let timer: ReturnType<typeof setTimeout> | null = null;
/** 권위 상태(전체). 화면(useApp.game)에는 내 시야로 가린 상태를 둔다 — 온라인과 같은 정보만 보이게 */
let full: GameState | null = null;

function actorOf(s: GameState): number {
  return s.pending.length ? s.pending[0].player : s.current;
}

function commit(s: GameState): void {
  const { me } = useApp.getState();
  full = s;
  useApp.getState().set({ game: maskFor(s, me) });
  storage.saveLocal(s, me, Date.now());
  scheduleAI();
}

function scheduleAI(): void {
  if (timer) clearTimeout(timer);
  const { mode } = useApp.getState();
  const game = full;
  if (mode !== 'local' || !game || game.gameOver) return;
  const actor = actorOf(game);
  if (!game.players[actor].isAI) return;
  timer = setTimeout(() => {
    timer = null;
    const s = full;
    if (!s || s.gameOver || useApp.getState().mode !== 'local') return;
    const who = actorOf(s);
    if (!s.players[who].isAI) return;
    const a = chooseAction(s, who) ?? { type: 'endTurn' as const };
    let r = applyAction(s, who, a);
    if (r.error) r = applyAction(s, who, fallbackAction(s, who));
    if (!r.error) commit(r.state);
  }, AI_DELAY);
}

function send(a: Action): void {
  const { me, showToast } = useApp.getState();
  const game = full;
  if (!game) return;
  const r = applyAction(game, me, a);
  if (r.error) {
    showToast(r.error);
    return;
  }
  commit(r.state);
}

export function startLocal(name: string, aiCount: number, seed: number): void {
  const seats = [{ name: name || '나', isAI: false }, ...Array.from({ length: aiCount }, (_, i) => ({ name: `AI ${i + 1}`, isAI: true }))];
  const game = createGame(seed, seats);
  useApp.getState().set({ screen: 'game', mode: 'local', me: 0, viewing: 0, send });
  commit(game);
}

export function resumeLocal(): boolean {
  const save = storage.loadLocal();
  if (!save || save.game.version !== 3 || !Array.isArray(save.game.rngState)) return false;
  useApp.getState().set({ screen: 'game', mode: 'local', me: save.me, viewing: save.me, send });
  commit(save.game);
  return true;
}

export function quitLocal(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  full = null;
  useApp.getState().set({ screen: 'home', mode: null, game: null, send: null });
}
