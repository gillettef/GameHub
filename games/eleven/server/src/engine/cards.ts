import {
  BOARD_CARDS,
  BOARD_DATA,
  EXECUTIVE_CARDS,
  OBJECTIVE_CARDS,
  OPPONENT_CARDS,
  PLAYER_CARDS,
  SPONSOR_CARDS,
  STAFF_CARDS,
  TACTIC_CARDS,
} from '../data';
import type {
  BoardCard,
  ExecutiveCard,
  ObjectiveCard,
  OpponentTeamCard,
  PlayerCard,
  PlayerSide,
  SponsorCard,
  StaffCard,
  TacticCard,
} from './types';
import type { PlayerInstance, UniformToken } from './state';

function index<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((c) => [c.id, c]));
}

const players = index(PLAYER_CARDS);
const staff = index(STAFF_CARDS);
const sponsors = index(SPONSOR_CARDS);
const board = index(BOARD_CARDS);
const executives = index(EXECUTIVE_CARDS);
const tactics = index(TACTIC_CARDS);
const objectives = index(OBJECTIVE_CARDS);
const opponents = index(OPPONENT_CARDS);

function get<T>(map: Map<string, T>, id: string, kind: string): T {
  const card = map.get(id);
  if (!card) throw new Error(`unknown ${kind} card: ${id}`);
  return card;
}

export const cards = {
  player: (id: string): PlayerCard => get(players, id, 'player'),
  staff: (id: string): StaffCard => get(staff, id, 'staff'),
  sponsor: (id: string): SponsorCard => get(sponsors, id, 'sponsor'),
  board: (id: string): BoardCard => get(board, id, 'board'),
  executive: (id: string): ExecutiveCard => get(executives, id, 'executive'),
  tactic: (id: string): TacticCard => get(tactics, id, 'tactic'),
  objective: (id: string): ObjectiveCard => get(objectives, id, 'objective'),
  opponent: (id: string): OpponentTeamCard => get(opponents, id, 'opponent'),
  // 상대 팀 이름: 팀마다 부에 따라 카드 id 가 다르므로(t01~08 은 3부·3/2부, t09~16 은 2/1부·1부) 팀 id 로 찾는다
  teamName: (teamId: string): string => OPPONENT_CARDS.find((c) => c.teamId === teamId)?.teamName ?? teamId,
  boardData: BOARD_DATA,
};

export function activeSide(instance: PlayerInstance): PlayerSide {
  const card = cards.player(instance.cardId);
  return instance.trained ? card.trained : card.untrained;
}

// 역량 + 역량 토큰 − 약점 토큰, 0 미만 불가 (p.15, p.28)
export function effectiveSkill(instance: PlayerInstance): number {
  const t = instance.tokens;
  return Math.max(0, activeSide(instance).skill + t.strengthTemp + t.strengthPerm - t.weaknessTemp - t.weaknessPerm);
}

// 표시 이름: 유망주는 훈련 전에는 모든 카드가 똑같이 '유망주'로 보인다 (사용자 결정, 2026-09). 훈련 면(또는 훈련된 인스턴스)에서 본명
export function playerName(cardId: string, trained = false): string {
  const card = cards.player(cardId);
  return card.kind === 'prospect' && !trained ? '유망주' : card.name;
}
export function instanceName(instance: PlayerInstance): string {
  return playerName(instance.cardId, instance.trained);
}

// 유니폼 토큰을 사람이 읽는 이름으로: 출전한 선수 카드의 토큰이면 "이름(번호)", 아니면 "유니폼 N번" (득점자 표시·기록용)
export function tokenLabel(player: { roster: PlayerInstance[]; uniforms: UniformToken[] }, played: string[], tokenId: string): string {
  const token = player.uniforms.find((u) => u.id === tokenId);
  if (!token) return '유니폼 토큰';
  const inst = token.cardInstanceId && played.includes(token.cardInstanceId) ? player.roster.find((r) => r.instanceId === token.cardInstanceId) : undefined;
  const number = token.number !== undefined ? `${token.number}번` : '번호 없음';
  return inst ? `${instanceName(inst)}(${number})` : `유니폼 ${number}`;
}
