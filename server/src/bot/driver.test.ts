import { describe, expect, it, vi } from 'vitest';
import { createRng } from '../engine/rng';
import { viewFor } from '../engine/view';
import { RoomManager } from '../rooms';
import { BotDriver } from './driver';
import { decide } from './policy';

// 사람 1명(호스트) + 서버 측 봇 3명. 사람 차례는 테스트가 같은 정책으로 대신 둔다
describe('BotDriver', () => {
  it('사람 + 봇 3명으로 한 판을 끝까지 진행한다', { timeout: 120000 }, () => {
    const rooms = new RoomManager();
    const { room, player: host } = rooms.create('사람', 31);
    rooms.addBot(room.code, host.id);
    rooms.addBot(room.code, host.id);
    rooms.addBot(room.code, host.id);
    expect(room.players.map((p) => p.isBot)).toEqual([false, true, true, true]);
    expect(new Set(room.players.map((p) => p.name)).size).toBe(4);
    rooms.start(room.code, host.id);

    let changes = 0;
    const driver = new BotDriver(rooms, () => changes++, 0);
    const rng = createRng(5);
    const failed = new Set<string>();
    const game = () => rooms.get(room.code).game!;
    let guard = 0;
    while (game().phase.kind !== 'gameOver') {
      if (++guard > 5000) throw new Error(`stuck in ${game().phase.kind} week ${game().week}`);
      driver.runUntilIdle(room.code);
      if (game().phase.kind === 'gameOver') break;
      const action = decide(viewFor(game(), host.id), rng, failed);
      if (!action) throw new Error(`사람이 할 일이 없는데 봇도 멈춤: ${game().phase.kind}`);
      try {
        rooms.act(room.code, host.id, action);
        failed.clear();
      } catch {
        failed.add(action.type);
      }
    }
    expect(room.status).toBe('over');
    expect(room.game!.week).toBe(6);
    expect(changes).toBeGreaterThan(100);
  });

  it('경기 결과에서 봇은 경기 보기 시간을 기다리지만, 접속한 사람이 모두 다 봤다고 알리면 바로 진행한다', () => {
    vi.useFakeTimers();
    try {
      const rooms = new RoomManager();
      const { room, player: host } = rooms.create('사람', 31);
      rooms.addBot(room.code, host.id);
      rooms.start(room.code, host.id);
      // 모든 참가자를 정책으로 움직여 봇이 경기 영향 주사위를 굴리기 전(경기 보기 스텝)까지 간다
      const rng = createRng(5);
      const failed = new Set<string>();
      const atBotWatch = () => {
        const ph = room.game!.phase;
        return ph.kind === 'friday.aftermath' && room.players.find((p) => p.id === ph.current)!.isBot && ph.matches[ph.current]!.roll === null;
      };
      for (let guard = 0; !atBotWatch(); guard++) {
        if (guard > 2000) throw new Error('봇의 경기 보기 스텝에 닿지 못함');
        const ph = room.game!.phase;
        const actorId = 'current' in ph ? ph.current : room.players.find((p) => decide(viewFor(room.game!, p.id), rng, failed))!.id;
        const action = decide(viewFor(room.game!, actorId), rng, failed);
        if (!action) throw new Error(`할 일이 없음: ${ph.kind}`);
        try {
          rooms.act(room.code, actorId, action);
          failed.clear();
        } catch {
          failed.add(action.type);
        }
      }
      let changes = 0;
      const driver = new BotDriver(rooms, () => changes++, 10, 10_000);
      driver.poke(room);
      vi.advanceTimersByTime(1000);
      expect(changes).toBe(0); // 아직 경기 보기 중
      const week = room.game!.week;
      const phase = room.game!.phase as { current: string };
      driver.rewatch(rooms.markWatched(room.code, host.id, week, phase.current));
      vi.advanceTimersByTime(50);
      expect(changes).toBeGreaterThan(0); // 사람이 다 봤으니 곧바로 굴림
    } finally {
      vi.useRealTimers();
    }
  });

  it('봇 추가/제거는 호스트만, 대기실에서만, 정원까지', () => {
    const rooms = new RoomManager();
    const { room, player: host } = rooms.create('a');
    const { player: b } = rooms.join(room.code, 'b');
    expect(() => rooms.addBot(room.code, b.id)).toThrow();
    rooms.addBot(room.code, host.id);
    rooms.addBot(room.code, host.id);
    expect(() => rooms.addBot(room.code, host.id)).toThrow();
    const bot = room.players.find((p) => p.isBot)!;
    expect(() => rooms.removeBot(room.code, host.id, b.id)).toThrow();
    rooms.removeBot(room.code, host.id, bot.id);
    expect(room.players).toHaveLength(3);
    rooms.start(room.code, host.id);
    expect(() => rooms.addBot(room.code, host.id)).toThrow();
  });
});
