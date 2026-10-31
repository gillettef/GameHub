// 로컬 AI 대전: 엔진을 직접 호출하고, AI 차례는 잠깐씩 쉬며 진행, 매 행동 자동 저장
import { createGame } from '../core/engine/setup';
import { applyAction } from '../core/engine/turn';
import { chooseAction, fallbackAction } from '../core/ai';
import type { Action, GameState } from '../core/types';
import { storage } from './storage';
import { useApp } from './app';

const AI_DELAY = 450;
let timer: ReturnType<typeof setTimeout> | null = null;

function actorOf(s: GameState): number {
  return s.pending.length ? s.pending[0].player : s.current;
}

function commit(s: GameState): void {
  const { me } = useApp.getState();
  useApp.getState().set({ game: s });
  storage.saveLocal(s, me, Date.now());
  scheduleAI();
}

function scheduleAI(): void {
  if (timer) clearTimeout(timer);
  const { game, mode } = useApp.getState();
  if (mode !== 'local' || !game || game.gameOver) return;
  const actor = actorOf(game);
  if (!game.players[actor].isAI) return;
  timer = setTimeout(() => {
    timer = null;
    const s = useApp.getState().game;
    if (!s || s.gameOver) return;
    const who = actorOf(s);
    if (!s.players[who].isAI) return;
    const a = chooseAction(s, who) ?? { type: 'endTurn' as const };
    let r = applyAction(s, who, a);
    if (r.error) r = applyAction(s, who, fallbackAction(s, who));
    if (!r.error) commit(r.state);
  }, AI_DELAY);
}

function send(a: Action): void {
  const { game, me, showToast } = useApp.getState();
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
  if (!save || save.game.version !== 2 || !Array.isArray(save.game.rngState)) return false;
  useApp.getState().set({ screen: 'game', mode: 'local', me: save.me, viewing: save.me, send });
  commit(save.game);
  return true;
}

export function quitLocal(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  useApp.getState().set({ screen: 'home', mode: null, game: null, send: null });
}
