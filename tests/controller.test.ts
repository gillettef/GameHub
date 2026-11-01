import { describe, expect, it } from 'vitest';
import { GameController, describe as describeEvent } from '../src/game/controller';
import { mulberry32 } from '../src/core/rng';
import { legalActions } from '../src/core/rules';

const instant = () => Promise.resolve();
const tick = () => new Promise((r) => setTimeout(r, 0));

async function idle(c: GameController) {
  for (let k = 0; k < 10000 && c.view.busy; k++) await tick();
  expect(c.view.busy).toBe(false);
}

describe('GameController', () => {
  it('AI 대결: 사람이 아무 수나 둬도 판이 끝까지 진행된다', async () => {
    const rng = mulberry32(3);
    const settled: number[] = [];
    const c = new GameController({ mode: 'ai', rng: mulberry32(9), sleep: instant, onSettled: (x) => settled.push(x.state.version) });
    c.start();
    await idle(c);
    for (let k = 0; k < 500 && c.state.phase !== 'over'; k++) {
      expect(c.canAct()).toBe(true);
      expect(c.state.current).toBe(0); // 입력 대기 시점엔 항상 사람(🔵) 차례
      const legal = legalActions(c.state);
      expect(c.act(legal[Math.floor(rng() * legal.length)])).toBe(true);
      await idle(c);
    }
    expect(c.state.phase).toBe('over');
    expect(settled.length).toBeGreaterThan(5);
  });

  it('진행 중(busy)에는 입력을 받지 않는다', async () => {
    let release: () => void = () => {};
    const gate = () => new Promise<void>((r) => (release = r));
    const c = new GameController({ mode: 'online', seat: 0, sleep: gate });
    c.start();
    for (let k = 0; k < 8; k++) {
      // 🔵(나)와 🔴(상대)가 번갈아 배치
      if (k % 2 === 0) c.act({ type: 'setup', hole: k % 6 });
      else c.remoteAction({ type: 'setup', hole: k % 6 }, c.state.version);
      await idle(c);
    }
    // 셋업 후 C = [🔵]. 🔵가 C에 투입하고 C에서 출발하면 단색 버스 → 자동 하차 동안 busy
    c.act({ type: 'place', hole: 2 });
    await idle(c);
    c.act({ type: 'endPlace' });
    await idle(c);
    expect(c.act({ type: 'pick', hole: 2 })).toBe(true); // C = [🔵, 🔵(투입)] → 단색 → 자동 하차
    expect(c.view.busy).toBe(true);
    expect(c.act({ type: 'pick', hole: 0 })).toBe(false);
    for (let k = 0; k < 10 && c.view.busy; k++) {
      release();
      await tick();
    }
    expect(c.view.busy).toBe(false);
    expect(c.state.current).toBe(1);
  });

  it('새 게임은 진행 중인 AI 흐름을 끊는다', async () => {
    const c = new GameController({ mode: 'ai', sleep: () => new Promise((r) => setTimeout(r, 5)) });
    c.start();
    c.act({ type: 'setup', hole: 0 });
    expect(c.view.busy).toBe(true); // AI 차례
    c.newGame();
    await new Promise((r) => setTimeout(r, 50));
    expect(c.state.version).toBe(0);
    expect(c.canAct()).toBe(true);
  });

  it('하차 하이라이트와 로그', async () => {
    const c = new GameController({ mode: 'online', seat: 0, sleep: instant });
    c.start();
    c.act({ type: 'setup', hole: 4 });
    await idle(c);
    expect(c.view.highlight).toBe(4);
    expect(c.view.log[0]).toBe('🔵 E 배치');
    expect(describeEvent({ type: 'lost', player: 0, tokens: [0, 1] })).toBe('🚌 놓을 곳이 없어 2명 낙선');
  });
});
