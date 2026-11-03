// 로컬 AI 대전: 엔진을 직접 호출하고, AI 차례는 잠깐씩 쉬며 진행, 매 행동 자동 저장
import { createGame } from '../core/engine/setup';
import { applyAction } from '../core/engine/turn';
import { chooseAction, fallbackAction } from '../core/ai';
import type { Action, GameState } from '../core/types';
import { maskFor } from '../core/mask';
import { storage, type AiSpeed } from './storage';
import { useApp } from './app';

/** AI 한 행동마다 쉬는 시간(설정 메뉴의 AI 속도) — 화면이 따라가며 무슨 일이 있었는지 볼 틈 */
export const AI_DELAY: Record<AiSpeed, number> = { normal: 1400, fast: 500, instant: 80 };
const UNDO_MAX = 30;
let timer: ReturnType<typeof setTimeout> | null = null;
/** 권위 상태(전체). 화면(useApp.game)에는 내 시야로 가린 상태를 둔다 — 온라인과 같은 정보만 보이게 */
let full: GameState | null = null;
/** 내 행동 직전 상태들. AI 가 움직이면 비운다(남의 행동을 되돌리지 않게) */
let history: GameState[] = [];

function actorOf(s: GameState): number {
  return s.pending.length ? s.pending[0].player : s.current;
}

function commit(s: GameState): void {
  const { me } = useApp.getState();
  full = s;
  useApp.getState().set({ game: maskFor(s, me), canUndo: history.length > 0 });
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
    if (!r.error) {
      history = [];
      commit(r.state);
    }
  }, AI_DELAY[useApp.getState().settings.aiSpeed] ?? AI_DELAY.normal);
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
  // 숨은 정보가 드러난 행동(뒷면 공개·덱에서 뽑기·난수 판정·시야 변화·상대와의 판정)은 되돌릴 수 없다 —
  // 되돌려서 본 정보로 다시 고르는 일이 없게 기록을 비운다
  if (reveals(game, r.state, me, a)) history = [];
  else {
    history.push(game);
    if (history.length > UNDO_MAX) history.shift();
  }
  commit(r.state);
}

/** 이 행동으로 전에 몰랐던 정보가 드러났는가 */
function reveals(before: GameState, after: GameState, me: number, a: Action): boolean {
  if (a.type === 'pickQuest' || a.type === 'raid' || a.type === 'declareConflict' || a.type === 'endTurn') return true;
  if (before.rngState.some((v, i) => v !== after.rngState[i])) return true;
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (!same(before.questDecks, after.questDecks) || !same(before.satDeck, after.satDeck) || !same(before.patronDecks, after.patronDecks)) return true;
  // 시야가 늘어 내게 보이는 퀘스트 트랙 칸이 바뀐 경우(위성 발사 등)
  return !same(maskFor(before, me).questRow, maskFor(after, me).questRow) || !same(before.questOpen, after.questOpen);
}

function undo(): void {
  const prev = history.pop();
  if (!prev) return;
  commit(prev);
  useApp.getState().showToast('되돌렸습니다');
}

export function startLocal(name: string, aiCount: number, seed: number): void {
  const seats = [{ name: name || '나', isAI: false }, ...Array.from({ length: aiCount }, (_, i) => ({ name: `AI ${i + 1}`, isAI: true }))];
  const game = createGame(seed, seats);
  useApp.getState().set({ screen: 'game', mode: 'local', me: 0, viewing: 0, send, undo, conn: null, mark: null, confirm: null, notices: [], eraBanner: null, session: useApp.getState().session + 1 });
  history = [];
  commit(game);
}

export function resumeLocal(): boolean {
  const save = storage.loadLocal();
  if (!save || save.game.version !== 5 || !Array.isArray(save.game.rngState)) return false;
  useApp.getState().set({ screen: 'game', mode: 'local', me: save.me, viewing: save.me, send, undo, conn: null, mark: null, confirm: null, notices: [], eraBanner: null, session: useApp.getState().session + 1 });
  history = [];
  commit(save.game);
  return true;
}

export function quitLocal(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  full = null;
  history = [];
  useApp.getState().set({ screen: 'home', mode: null, game: null, send: null, undo: null, canUndo: false, mark: null, confirm: null, notices: [], eraBanner: null });
}
