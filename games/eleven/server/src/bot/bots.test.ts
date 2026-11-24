import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { Bot } from './bot';

// 봇 4명이 실제 WebSocket 으로 한 판을 끝까지 돌린다 (서버·프로토콜·뷰·정책 통합)
describe('봇 4인플', () => {
  const { server, rooms } = createApp(undefined, { noRateLimit: true });
  let url = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `ws://localhost:${(server.address() as AddressInfo).port}/ws`;
  });
  afterAll(() => server.close());

  it('게임 종료까지 진행하고 승자를 낸다', { timeout: 180000 }, async () => {
    const lines: string[] = [];
    const bots = Array.from({ length: 4 }, (_, i) => new Bot({ url, name: `bot${i}`, seed: 100 + i, delayMs: 0, log: (l) => lines.push(l) }));
    await bots[0]!.connect(undefined, 77);
    for (const b of bots.slice(1)) await b.connect(bots[0]!.code);
    bots[0]!.startGame();
    await Promise.all(bots.map((b) => b.waitForGameOver()));

    const room = rooms.get(bots[0]!.code);
    expect(room.status).toBe('over');
    expect(room.game?.phase.kind).toBe('gameOver');
    if (room.game?.phase.kind !== 'gameOver') throw new Error();
    expect(room.game.week).toBe(6);
    expect(room.game.phase.winners.length).toBeGreaterThan(0);
    const rejected = lines.filter((l) => l.includes('거부'));
    // 정책이 시도했다 거부당하는 경우는 있어도 무한 반복은 없어야 한다
    expect(rejected.length).toBeLessThan(200);
    for (const b of bots) b.close();
  });
});
