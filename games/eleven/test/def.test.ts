// GameDef(src/def.ts): 공통 방·진행 코드와 엔진 사이. 옛 서버(rooms.ts·driver.ts·ws.ts)의 테스트가 보던 것 중 게임에 남은 것을 옮겼다.
import { Match, RuleError, type SeatInfo, type Timers } from '@gamehub/net';
import { describe, expect, it } from 'vitest';
import { playHeadless } from '../src/bot/headless';
import { BOT_WATCH_MS, def, engineActors, parseAction, pidOf, type Action, type Table } from '../src/def';
import { createRng } from '../src/engine/rng';
import { rngOf, seedState } from '../src/seeded';

const ctx = { name: (i: number) => `${i + 1}번`, log: () => {}, byBot: false };
const humans = (n: number): SeatInfo[] => Array.from({ length: n }, (_, i) => ({ kind: 'human', name: `사람${i + 1}` }));
const bots = (n: number): SeatInfo[] => Array.from({ length: n }, (_, i) => ({ kind: 'bot', name: `봇 ${i + 1}` }));

/** 가짜 시계·타이머: 예약된 것을 시간 순서대로 실행한다 */
function fakeTime() {
  let now = 0;
  let seq = 0;
  const queue = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set(fn, ms) {
      const id = ++seq;
      queue.set(id, { at: now + ms, fn });
      return id;
    },
    clear(h) {
      queue.delete(h as number);
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...queue.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      queue.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  return { timers, now: () => now, advance };
}

describe('seeded rng', () => {
  it('상태를 숫자로 들고 있어도 엔진의 createRng 와 같은 수열을 낸다', () => {
    for (const seed of [1, 42, 2147483646]) {
      const a = createRng(seed);
      const holder = { s: seedState(seed) };
      for (let i = 0; i < 200; i++) expect(rngOf(holder).float()).toBe(a.float());
      expect(rngOf({ s: holder.s }).shuffle([1, 2, 3, 4, 5, 6])).toEqual(a.shuffle([1, 2, 3, 4, 5, 6]));
    }
  });
});

describe('setup', () => {
  it('같은 시드면 같은 게임, 시작 순서는 섞이고(같은 참가자 집합) 기록에 남는다', () => {
    const a = def.setup({ seats: humans(4), seed: 99, options: { division: 2 } });
    const b = def.setup({ seats: humans(4), seed: 99, options: { division: 2 } });
    expect(a.game.market).toEqual(b.game.market);
    expect(a.game.division).toBe(2);
    expect([...a.game.seats].sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(a.game.firstPlayer).toBe(a.game.seats[0]);
    expect(a.game.log.at(-1)?.text).toMatch(/시작 순서를 무작위로 정함/);
    // 여러 시드 중에는 순서가 바뀐 판이 있다
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => def.setup({ seats: humans(4), seed, options: { division: 3 } }).game.seats.join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('엠블럼은 좌석마다 겹치지 않는다', () => {
    const t = def.setup({ seats: humans(4), seed: 5, options: { division: 3 } });
    expect(new Set(t.emblems).size).toBe(4);
  });

  it('옵션: 부는 1·2·3 만, 나머지는 3부', () => {
    expect(def.parseOptions!({ division: 1 })).toEqual({ division: 1 });
    expect(def.parseOptions!({ division: 7 })).toEqual({ division: 3 });
    expect(def.parseOptions!(undefined)).toEqual({ division: 3 });
  });
});

describe('parseAction', () => {
  it('형식이 맞는 행동만 받는다', () => {
    expect(parseAction({ type: 'endTurn' })).toEqual({ type: 'endTurn' });
    expect(parseAction({ type: 'recruitPlayer', marketIndex: 2, row: 'veterans' })).toEqual({ type: 'recruitPlayer', marketIndex: 2, row: 'veterans' });
    expect(parseAction({ type: 'recruitPlayer', marketIndex: 2, row: 'staff' })).toBeNull();
    expect(parseAction({ type: 'recruitPlayer', marketIndex: -1 })).toBeNull();
    expect(parseAction({ type: 'signSponsor', marketIndex: 0, contract: 'billboard', billboardChoice: 'bonus' })).toBeTruthy();
    expect(parseAction({ type: 'signSponsor', marketIndex: 0, contract: 'x' })).toBeNull();
    expect(parseAction({ type: 'cardAction', source: { kind: 'staff', index: 1 }, paid: true })).toEqual({ type: 'cardAction', source: { kind: 'staff', index: 1 }, paid: true });
    expect(parseAction({ type: 'cardAction', source: { kind: 'boss', index: 1 } })).toBeNull();
    expect(parseAction({ type: 'buildInfrastructure', infrastructure: 'castle' })).toBeNull();
    expect(parseAction({ type: 'playTacticEffect', cardId: null })).toEqual({ type: 'playTacticEffect', cardId: null });
    expect(parseAction({ type: 'emblem', emblem: 'star' })).toEqual({ type: 'emblem', emblem: 'star' });
    expect(parseAction({ type: 'emblem', emblem: 'skull' })).toBeNull();
    expect(parseAction({ type: 'hack' })).toBeNull();
    expect(parseAction(null)).toBeNull();
    expect(parseAction('endTurn')).toBeNull();
  });

  it('라인업: 지역·자원·관중석을 엄격히 본다(음수·소수·모르는 자원은 거절)', () => {
    const ok = { tacticCardId: 'tc-01', formationIndex: 0, players: ['i1'], placements: { u2: 'back-C' }, activations: { i1: { stamina: 1 } }, fandomInStands: 2 };
    expect(parseAction({ type: 'submitLineup', submission: ok })).toEqual({ type: 'submitLineup', submission: ok });
    expect(parseAction({ type: 'submitLineup', submission: { ...ok, placements: { u2: 'moon' } } })).toBeNull();
    expect(parseAction({ type: 'submitLineup', submission: { ...ok, fandomInStands: -1 } })).toBeNull();
    expect(parseAction({ type: 'submitLineup', submission: { ...ok, fandomInStands: 1.5 } })).toBeNull();
    expect(parseAction({ type: 'submitLineup', submission: { ...ok, activations: { i1: { gold: 1 } } } })).toBeNull();
    expect(parseAction({ type: 'submitLineup', submission: { ...ok, activations: { i1: { money: -2 } } } })).toBeNull();
    expect(parseAction({ type: 'submitLineup', submission: { ...ok, players: [1] } })).toBeNull();
  });
});

describe('apply', () => {
  it('거절하면 상태를 건드리지 않고 한국어 RuleError', () => {
    const t = def.setup({ seats: humans(2), seed: 3, options: { division: 3 } });
    const before = structuredClone(t);
    expect(() => def.apply(t, 0, { type: 'draftPick', cardId: 'no-such' }, ctx)).toThrow(RuleError);
    expect(() => def.apply(t, 0, { type: 'endTurn' }, ctx)).toThrow(/[가-힣]/);
    expect(t).toEqual(before);
  });

  it('행동은 그 좌석의 참가자로만 적용된다(남의 자리를 사칭할 수 없다)', () => {
    const t = def.setup({ seats: humans(2), seed: 3, options: { division: 3 } });
    if (t.game.phase.kind !== 'setup.draft') throw new Error('draft');
    const theirs = t.game.phase.hands.p1![0]!;
    const mine = t.game.phase.hands.p0![0]!;
    expect(() => def.apply(t, 0, { type: 'draftPick', cardId: theirs }, ctx)).toThrow(RuleError);
    const next = def.apply(t, 0, { type: 'draftPick', cardId: mine }, ctx);
    if (next.game.phase.kind !== 'setup.draft') throw new Error('draft');
    expect(next.game.phase.picked.p0).toBe(mine);
    expect(next.game.phase.picked.p1).toBeNull();
    expect(t.game.phase.kind === 'setup.draft' && t.game.phase.picked.p0).toBeNull(); // 원래 상태는 그대로
  });

  it('엠블럼: 준비 단계에서만, 남의 것은 못 고른다', () => {
    const t = def.setup({ seats: humans(2), seed: 3, options: { division: 3 } });
    expect(() => def.apply(t, 0, { type: 'emblem', emblem: t.emblems[1]! }, ctx)).toThrow(RuleError);
    const free = (['star', 'crown', 'bolt'] as const).find((e) => !t.emblems.includes(e))!;
    expect(def.apply(t, 0, { type: 'emblem', emblem: free }, ctx).emblems[0]).toBe(free);
  });
});

describe('view', () => {
  it('남의 드래프트 손패·목표·전술 손패와 난수·덱 순서·되돌리기 스냅샷은 보내지 않는다', () => {
    const { table } = playUntil(humans(2), 11, (t) => t.game.phase.kind === 'weekday');
    const v = def.view(table, 0);
    const json = JSON.stringify(v);
    expect(v.game.me).toBe('p0');
    expect(v.game.self.objective).toBe(table.game.players.p0!.objective);
    expect(json).not.toContain(table.game.players.p1!.objective!);
    expect(json).not.toContain('"rng"');
    expect(json).not.toContain('"seed"');
    expect(json).not.toContain('turnSnapshot');
    expect(json).not.toContain('"decks"');
    expect(v.game.players.p1).not.toHaveProperty('tacticCards');
    expect(v.game.players.p1).not.toHaveProperty('objective');
    expect(v.kinds).toEqual({ p0: 'human', p1: 'human' });
  });

  it('관전자는 참가자가 아닌 뷰(본인 비공개 정보 없음)', () => {
    const t = def.setup({ seats: humans(2), seed: 4, options: { division: 3 } });
    const v = def.view(t, null);
    expect(v.game.me).toBe('');
    expect(v.game.self.objective).toBeUndefined();
    expect(v.game.phase.kind === 'setup.draft' && v.game.phase.hand).toEqual([]);
  });

  it('임원 드래프트 중에는 남이 고른 임원을 빼고 보낸다', () => {
    const t = def.setup({ seats: humans(2), seed: 4, options: { division: 3 } });
    if (t.game.phase.kind !== 'setup.draft') throw new Error('draft');
    const a = def.apply(t, 0, { type: 'draftPick', cardId: t.game.phase.hands.p0![0]! }, ctx);
    const b = def.apply(a, 1, { type: 'draftPick', cardId: t.game.phase.hands.p1![0]! }, ctx);
    expect(def.view(b, 1).game.players.p0!.executives).toEqual([]);
    expect(def.view(b, 0).game.players.p0!.executives.length).toBe(1);
  });
});

/** 조건이 될 때까지 봇 정책으로 모든 좌석을 둔다 */
function playUntil(seats: SeatInfo[], seed: number, stop: (t: Table) => boolean) {
  let table = def.setup({ seats, seed, options: { division: 3 } });
  const memory = seats.map(() => ({}));
  for (let i = 0; i < 5000 && !stop(table); i++) {
    table = { ...table, hold: null };
    const seat = def.actors(table)[0]!;
    table = def.apply(table, seat, def.bot!.next(table, seat, memory[seat]!)!, ctx);
  }
  if (!stop(table)) throw new Error('조건에 닿지 않음');
  return { table, memory };
}

describe('봇', () => {
  it.each([
    [1, 3, 1],
    [2, 2, 17],
    [3, 1, 23],
    [4, 3, 31],
    [4, 1, 77],
  ] as const)('%i명 %i부 시드 %i: 봇만으로 6주를 끝까지 둔다', { timeout: 120_000 }, (n, division, seed) => {
    const { table, moves } = playHeadless(bots(n), seed, { division });
    expect(table.game.phase.kind).toBe('gameOver');
    expect(table.game.week).toBe(6);
    expect(moves.length).toBeGreaterThan(50);
    expect(engineActors(table.game)).toEqual([]);
  });

  it('같은 시드·같은 행동이면 같은 결과(이어 하기가 기록을 다시 적용해도 같다)', { timeout: 120_000 }, () => {
    const { table, moves } = playHeadless(bots(3), 8);
    let again = def.setup({ seats: bots(3), seed: 8, options: { division: 3 } });
    for (const m of moves) again = def.apply(again, m.seat, m.action, ctx);
    expect(again.game).toEqual(table.game);
  });
});

describe('봇 쉼·경기 보기 대기(공통 Match + 시계)', () => {
  function run(seats: SeatInfo[], seed: number) {
    const time = fakeTime();
    const match = new Match(def, {
      seats,
      seed,
      options: { division: 3 },
      timers: time.timers,
      now: time.now,
      autoDelay: (i) => (seats[i]!.kind === 'bot' ? def.bot!.delayMs : null),
      onChange: () => {},
    });
    match.schedule();
    return { match, time };
  }
  const humanMove = (match: Match<Table, Action, unknown, unknown>, seat: number, memory: Record<string, unknown>) => {
    const action = def.bot!.next(match.state, seat, memory) ?? def.bot!.fallback!(match.state, seat);
    match.act(seat, action!);
  };

  it('봇이 주사위를 굴린 뒤에는 결과를 읽을 시간만큼 더 쉰다', () => {
    const { match, time } = run(bots(1), 2);
    let rolled = -1;
    for (let i = 0; i < 400 && rolled < 0; i++) {
      time.advance(100);
      const last = match.history.at(-1);
      if (last?.action.type === 'rollBoardDie') rolled = match.history.length;
    }
    expect(rolled).toBeGreaterThan(0);
    time.advance(800 * 3 - 100); // 굴림 배수 4 → 기본 간격 + 2400ms
    expect(match.history.length).toBe(rolled);
    time.advance(800 + 300);
    expect(match.history.length).toBe(rolled + 1);
    expect(match.history.at(-1)!.action.type).toBe('acceptBoardRoll');
  });

  it('경기 결과에서 차례인 봇은 사람들이 경기 보기를 마칠 때까지(최대 24초) 기다리고, 다 보면 바로 진행한다', { timeout: 120_000 }, () => {
    const seats: SeatInfo[] = [{ kind: 'human', name: '사람' }, ...bots(2)];
    for (const seed of [31, 32, 33, 34, 35]) {
      const { match, time } = run(seats, seed);
      const memory = {};
      const botWaiting = () => match.state.hold?.watch === true;
      for (let i = 0; i < 20000 && !botWaiting() && !match.over; i++) {
        if (match.actors().includes(0)) humanMove(match, 0, memory);
        else time.advance(500);
      }
      if (!botWaiting()) continue; // 이 시드는 사람이 마지막 차례였다
      const before = match.history.length;
      time.advance(BOT_WATCH_MS - 2000);
      expect(match.history.length).toBe(before); // 아직 기다린다
      expect(match.actors()).toEqual([0]); // 사람만 '다 봤다'를 보낼 수 있다
      expect(def.view(match.state, 0).watchWait).toBe(true);
      match.act(0, { type: 'watched' });
      expect(match.state.hold).toBeNull();
      time.advance(def.bot!.delayMs + 10);
      expect(match.history.length).toBe(before + 2); // watched + 봇의 굴림
      expect(match.history.at(-1)!.action.type).toBe('rollMatchDie');
      return;
    }
    throw new Error('봇이 경기 결과 차례가 되는 판을 찾지 못함');
  });

  it('아무도 보지 않으면 24초 뒤 봇이 스스로 진행한다', () => {
    const seats: SeatInfo[] = [{ kind: 'human', name: '사람' }, ...bots(1)];
    for (const seed of [41, 42, 43, 44]) {
      const { match, time } = run(seats, seed);
      const memory = {};
      for (let i = 0; i < 20000 && !match.state.hold?.watch && !match.over; i++) {
        if (match.actors().includes(0)) humanMove(match, 0, memory);
        else time.advance(500);
      }
      if (!match.state.hold?.watch) continue;
      const before = match.history.length;
      time.advance(BOT_WATCH_MS + def.bot!.delayMs + 300);
      expect(match.history.length).toBe(before + 1);
      expect(match.history.at(-1)!.action.type).toBe('rollMatchDie');
      return;
    }
    throw new Error('봇이 경기 결과 차례가 되는 판을 찾지 못함');
  });

  it('기다리는 경기 보기가 없으면 watched 는 거절', () => {
    const t = def.setup({ seats: humans(1), seed: 1, options: { division: 3 } });
    expect(() => def.apply(t, 0, { type: 'watched' }, ctx)).toThrow(RuleError);
  });

  it('사람 차례 상대 중에도 대상 선택이 남은 참가자는 행동할 수 있다(actors 에 들어간다)', () => {
    const t = def.setup({ seats: humans(2), seed: 1, options: { division: 3 } });
    expect(def.actors(t)).toEqual([0, 1]);
    expect(pidOf(1)).toBe('p1');
  });
});
