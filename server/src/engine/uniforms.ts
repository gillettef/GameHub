import type { PlayerSide } from './types';
import type { UniformToken } from './state';

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
