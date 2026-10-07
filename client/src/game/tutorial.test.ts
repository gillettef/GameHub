import { describe, expect, it } from 'vitest';
import { applyAction } from '@astraltab/shared';
import type { GameState, RoomInfo } from '@astraltab/shared';
import { localDeadline, formatRemaining, turnTimeLabel } from '../lib/turnClock';
import { createHotseatGame, hotseatPlayerId } from './hotseat';
import { tutorialBotAction } from './tutorialBot';

const game = () =>
  createHotseatGame({
    mapId: 'binary-star',
    seed: 20261006,
    players: [
      { nickname: '나', race: 'coalition' },
      { nickname: '연습 봇', race: 'coalition' },
    ],
  });

describe('튜토리얼 연습 봇', () => {
  it('항상 엔진이 받아 주는 수를 두고, 한 번 놓으면 턴을 끝낸다', () => {
    let s: GameState = game();
    // 사람은 매번 패스만, 봇이 20라운드 동안 두게 해 본다
    for (let i = 0; i < 80 && s.phase === 'playing'; i++) {
      const cur = s.currentPlayerId as string;
      const action = cur === hotseatPlayerId(1) ? tutorialBotAction(s, cur) : ({ type: 'PASS', playerId: cur } as const);
      const r = applyAction(s, action);
      expect(r.error).toBeUndefined();
      if (action.type === 'PLACE') {
        expect(tutorialBotAction(r.state, cur).type).toBe('PASS');
      }
      s = r.state;
    }
    expect(s.markers.some((m) => m.ownerId === hotseatPlayerId(1) && m.kind !== 'core')).toBe(true);
  });

  it('놓을 수 있는 카드가 없으면 패스한다', () => {
    const s = game();
    const bot = hotseatPlayerId(1);
    const broke = { ...s, players: s.players.map((p) => (p.id === bot ? { ...p, energy: 0, hand: p.hand.filter(() => false) } : p)) };
    expect(tutorialBotAction(broke, bot)).toEqual({ type: 'PASS', playerId: bot });
  });
});

describe('턴 제한 시간 표시 (Rules.md 5.4)', () => {
  const room = (deadline: number | null, serverNow: number): RoomInfo => ({
    roomId: 'r',
    hostId: 'p1',
    hasPassword: false,
    createdAt: 0,
    connected: [],
    turnTimeLimitSec: 90,
    turnDeadline: deadline,
    serverNow,
    autopilot: [],
  });

  it('서버 시계와의 차이를 보정해 내 시계 기준 마감을 낸다', () => {
    // 서버가 내 시계보다 5초 빠르다: 서버 기준 30초 남음 → 내 시계 기준으로도 30초 뒤
    expect(localDeadline(room(105_000, 75_000), 70_000)).toBe(100_000);
    expect(localDeadline(room(null, 75_000), 70_000)).toBeNull();
    expect(localDeadline(null, 70_000)).toBeNull();
  });

  it('표기', () => {
    expect(turnTimeLabel(90)).toBe('90초');
    expect(turnTimeLabel(180)).toBe('3분');
    expect(turnTimeLabel(null)).toBe('없음');
    expect(formatRemaining(75)).toBe('1:15');
    expect(formatRemaining(9)).toBe('9초');
  });
});
