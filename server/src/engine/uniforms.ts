import { activeSide } from './cards';
import type { PlayerSide } from './types';
import type { PlayerInstance, UniformToken } from './state';

export const NUMBERED_TOKENS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const BLANK_COUNT = 3;

export function createUniformTokens(): UniformToken[] {
  const numbered = NUMBERED_TOKENS.map((n): UniformToken => ({ id: `u${n}`, number: n, face: 'defense', location: 'field' }));
  const blanks = Array.from({ length: BLANK_COUNT }, (_, i): UniformToken => ({ id: `ub${i + 1}`, face: 'defense', location: 'bench' }));
  return [...numbered, ...blanks];
}

// 선수 카드가 유니폼 토큰을 필요로 하는가 (골키퍼는 토큰 없음, p.8)
export function needsUniform(side: PlayerSide): boolean {
  return !side.goalkeeper;
}

// 영입/훈련 시 대응 토큰을 역할 면으로 뒤집는다 (p.15). 번호 없음/12 이상이면 번호 없는 토큰을 쓰고,
// 카드 없는 필드 토큰(가장 큰 번호)과 교환한다 (p.8)
export function assignUniform(tokens: UniformToken[], instanceId: string, side: PlayerSide): void {
  if (!needsUniform(side)) return;
  releaseUniform(tokens, instanceId);

  if (side.number !== undefined && side.number <= 11) {
    const token = tokens.find((t) => t.number === side.number);
    if (!token) return;
    token.face = side.role;
    token.cardInstanceId = instanceId;
    return;
  }

  const blank = tokens.find((t) => t.location === 'bench' && t.number === undefined && !t.cardInstanceId)
    ?? tokens.find((t) => t.location === 'bench' && !t.cardInstanceId);
  if (!blank) return;
  blank.face = side.role;
  blank.cardInstanceId = instanceId;

  const swapOut = tokens
    .filter((t) => t.location === 'field' && !t.cardInstanceId)
    .sort((a, b) => (b.number ?? -1) - (a.number ?? -1))[0];
  if (swapOut) {
    swapOut.location = 'bench';
    blank.location = 'field';
  }
}

export function releaseUniform(tokens: UniformToken[], instanceId: string): void {
  for (const t of tokens) if (t.cardInstanceId === instanceId) delete t.cardInstanceId;
}

// 선수 카드가 쓰는 유니폼 토큰: 등번호 2~11 은 그 번호 토큰(같은 번호 선수가 여럿이면 하나를 나눠 쓴다), 번호 없음/12 이상은 그 선수에게 배정된 번호 없는 토큰
export function tokenFor(tokens: UniformToken[], inst: PlayerInstance): UniformToken | undefined {
  const side = activeSide(inst);
  if (!needsUniform(side)) return undefined;
  if (side.number !== undefined && side.number <= 11) return tokens.find((t) => t.number === side.number);
  return tokens.find((t) => t.cardInstanceId === inst.instanceId);
}

// 출전 선수가 자기 토큰을 가져간다 (사용자 제보 2026-09-22): 토큰의 cardInstanceId 는 마지막에 영입·훈련된 선수 하나만 가리키므로, 같은 등번호 A·B 중
// 나중에 들어온 B 만 연결돼 있으면 A 만 출전시켜도 토큰은 카드 없는 것(역량 1)으로 판정되고 화면엔 B 가 출전한 것처럼 보였다. 라인업 제출과 미리보기 때
// 출전 선수마다 토큰의 연결과 면을 그 선수로 맞춘다 — 실물에서 토큰을 출전하는 카드 쪽으로 뒤집는 것과 같다. 출전하지 않는 같은 번호 선수는 연결이 풀린다
export function claimUniforms(player: { roster: PlayerInstance[]; uniforms: UniformToken[] }, played: string[]): void {
  for (const id of played) {
    const inst = player.roster.find((r) => r.instanceId === id);
    const token = inst && tokenFor(player.uniforms, inst);
    if (!inst || !token) continue;
    token.cardInstanceId = inst.instanceId;
    token.face = activeSide(inst).role;
  }
}

// 방출 뒤 토큰 정리 (사용자 제보 2026-09-22): 방출한 선수가 쓰던 번호 토큰을 같은 등번호의 남은 선수에게 넘긴다 — 아니면 그 선수는 토큰 없이 남는다
export function releaseUniformOf(player: { roster: PlayerInstance[]; uniforms: UniformToken[] }, inst: PlayerInstance): void {
  const token = player.uniforms.find((t) => t.cardInstanceId === inst.instanceId);
  releaseUniform(player.uniforms, inst.instanceId);
  if (!token || token.number === undefined) return;
  const heir = player.roster.find((r) => r.instanceId !== inst.instanceId && needsUniform(activeSide(r)) && activeSide(r).number === token.number);
  if (heir) assignUniform(player.uniforms, heir.instanceId, activeSide(heir));
}

// 준비 단계 (p.8 e): 카드 없는 필드 토큰을 낮은 번호부터 수비로 뒤집어 필드가 정확히 공격 5 / 수비 5가 되게 한다
export function balanceFieldFaces(tokens: UniformToken[]): void {
  const field = tokens.filter((t) => t.location === 'field');
  let defense = field.filter((t) => t.cardInstanceId && t.face === 'defense').length;
  const free = field.filter((t) => !t.cardInstanceId).sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
  for (const t of free) {
    if (defense < 5) {
      t.face = 'defense';
      defense++;
    } else {
      t.face = 'attack';
    }
  }
}
