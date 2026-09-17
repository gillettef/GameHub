import { describe, expect, it } from 'vitest';
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
