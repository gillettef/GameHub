import { describe, expect, it } from 'vitest';
import type { PlayerSide } from './types';
import { assignUniform, balanceFieldFaces, createUniformTokens, releaseUniform } from './uniforms';

const side = (over: Partial<PlayerSide>): PlayerSide => ({ cost: 1, role: 'attack', zones: ['CF'], skill: 1, ...over });

describe('유니폼 토큰 (p.8, p.15)', () => {
  it('초기: 번호 2~11 필드, 번호 없는 3개 벤치', () => {
    const t = createUniformTokens();
    expect(t.filter((u) => u.location === 'field').map((u) => u.number)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(t.filter((u) => u.location === 'bench').every((u) => u.number === undefined)).toBe(true);
  });

  it('번호 있는 선수: 해당 토큰을 역할 면으로', () => {
    const t = createUniformTokens();
    assignUniform(t, 'x', side({ number: 7, role: 'attack' }));
    const token = t.find((u) => u.number === 7)!;
    expect(token.face).toBe('attack');
    expect(token.cardInstanceId).toBe('x');
  });

  it('번호 없는 선수/12 이상: 벤치의 빈 토큰을 카드 없는 필드 토큰(최대 번호)과 교환', () => {
    const t = createUniformTokens();
    assignUniform(t, 'gk-no', side({ number: 14, role: 'defense' }));
    const blank = t.find((u) => u.cardInstanceId === 'gk-no')!;
    expect(blank.number).toBeUndefined();
    expect(blank.location).toBe('field');
    expect(blank.face).toBe('defense');
    expect(t.find((u) => u.number === 11)!.location).toBe('bench');
    expect(t.filter((u) => u.location === 'field')).toHaveLength(10);
  });

  it('골키퍼는 토큰을 쓰지 않는다', () => {
    const t = createUniformTokens();
    assignUniform(t, 'gk', side({ number: 1, zones: [], goalkeeper: { saves: 1 } }));
    expect(t.some((u) => u.cardInstanceId === 'gk')).toBe(false);
  });

  it('재배정 시 이전 토큰을 해제한다 (유망주 훈련 후 번호 획득)', () => {
    const t = createUniformTokens();
    assignUniform(t, 'p', side({}));
    expect(t.find((u) => u.cardInstanceId === 'p')!.number).toBeUndefined();
    assignUniform(t, 'p', side({ number: 5 }));
    expect(t.filter((u) => u.cardInstanceId === 'p')).toHaveLength(1);
    expect(t.find((u) => u.cardInstanceId === 'p')!.number).toBe(5);
    releaseUniform(t, 'p');
    expect(t.some((u) => u.cardInstanceId === 'p')).toBe(false);
  });

  it('balanceFieldFaces: 카드 없는 토큰은 낮은 번호부터 수비, 필드 공격 5/수비 5', () => {
    const t = createUniformTokens();
    assignUniform(t, 'a', side({ number: 9, role: 'attack' }));
    assignUniform(t, 'b', side({ number: 3, role: 'attack' }));
    balanceFieldFaces(t);
    const field = t.filter((u) => u.location === 'field');
    expect(field.filter((u) => u.face === 'attack').map((u) => u.number).sort((x, y) => x! - y!)).toEqual([3, 8, 9, 10, 11]);
    expect(field.filter((u) => u.face === 'defense').map((u) => u.number)).toEqual([2, 4, 5, 6, 7]);
  });
});
