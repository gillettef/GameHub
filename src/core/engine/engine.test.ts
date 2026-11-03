import { describe, expect, it } from 'vitest';
import { createGame } from './setup';
import { applyAction } from './turn';
import { webGraph, researchCost, researchBlock, twigNeighborTrunks } from './research';
import { advanceEra } from './era';
import { checkPatronDemands, pickBlock, slotVisible } from './quest';
import { sight } from './derive';
import { unitPoolCap, defenseValue, health, plague, playerMods, productionPreview, requiredHealth, stage, unhealthy } from './derive';
import { scorePlayer } from './scoring';
import { chooseAction } from '../ai';
import { TWIG_DEFS, trunkId, CORE_ID } from '../data/techWeb';
import { QUEST_DEFS } from '../data/quests';
import { clone } from './util';
import { COLONIST_TOTAL, COLONIST_TRACK, ERA_TRUNK_PER_PLAYER, FEAST_CULTURE, FEAST_FOOD, FEAST_KEEP_FOOD, FEAST_MIN_FOOD, PATRON_FAIL_CULTURE, PATRON_MET_CULTURE_PER_ERA, QUEST_ROW_SIZE, SEAT_BONUS, START_RES, TRUNK_BASE_COST, colonistTrack } from '../data/constants';
import { produce } from './turn';
import type { Action, GameState } from '../types';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isAI: true }));

/** 퀘스트 선택을 마친 것으로 둔 게임(대외 단계부터) */
function ready(seed = 1, n = 3): GameState {
  const s = createGame(seed, seats(n));
  s.phase = 'external';
  return s;
}

/** 차례 처음 퀘스트 선택 단계의 게임. 칸 slot 에 원하는 카드를 놓는다 */
function atQuest(id: string, slot = 0, seed = 1, n = 3): GameState {
  const s = createGame(seed, seats(n));
  s.questRow[slot] = id;
  return s;
}

function act(s: GameState, a: Action, actor = s.current): GameState {
  const r = applyAction(s, actor, a);
  if (r.error) throw new Error(r.error);
  return r.state;
}

describe('준비', () => {
  it('같은 시드면 같은 상태', () => {
    expect(createGame(7, seats(3))).toEqual(createGame(7, seats(3)));
    expect(createGame(7, seats(3)).layout).toEqual(createGame(8, seats(3)).layout);
  });

  it('테크 웹 배치는 고정이고 제약을 지킨다: 12시 농업, 한 줄기 곁가지 노선이 다름, 고리별 노선 4개씩', () => {
    const first = createGame(1, seats(2)).layout;
    for (let seed = 1; seed <= 30; seed++) {
      const { layout } = createGame(seed, seats(2));
      expect(layout).toEqual(first);
      expect(layout.dirOrder).toEqual(['agri', 'culture', 'academic', 'power', 'industry', 'defense']);
      expect(new Set(layout.dirOrder).size).toBe(6);
      for (const ring of [1, 2, 3]) {
        const counts: Record<string, number> = {};
        for (const dir of layout.dirOrder) {
          const [a, b] = layout.twigs[trunkId(dir, ring)];
          expect(TWIG_DEFS[a].doctrine).not.toBe(TWIG_DEFS[b].doctrine);
          for (const t of [a, b]) counts[TWIG_DEFS[t].doctrine] = (counts[TWIG_DEFS[t].doctrine] ?? 0) + 1;
        }
        expect(counts).toEqual({ ark: 4, symbiont: 4, synth: 4 });
      }
    }
  });

  it('대기 결정 중에는 다른 행동이 막힌다', () => {
    const s = ready();
    s.pending.push({ kind: 'coexist', player: 0, questId: 'q1t1' });
    expect(applyAction(s, s.current, { type: 'endTurn' }).error).toBeTruthy();
  });
});

describe('테크 웹 연구', () => {
  it('연결과 고리 제한', () => {
    const s = ready();
    const p = s.players[s.current];
    expect(researchBlock(s, p, trunkId('agri', 1))).toBeNull();
    expect(researchBlock(s, p, trunkId('agri', 2))).toBe('아직 연구할 수 없는 고리');
    const twig = s.layout.twigs[trunkId('agri', 1)][0];
    expect(researchBlock(s, p, `w:${twig}`)).toBe('연결된 연구 노드 없음');
  });

  it('연구하면 과학과 지휘를 쓰고 입력 상태는 바뀌지 않는다', () => {
    const s = ready();
    const p = s.players[s.current];
    p.res.sci = 10;
    const before = clone(s);
    const node = trunkId('agri', 1);
    const cost = researchCost(s, p, node, playerMods(p));
    const after = act(s, { type: 'research', node });
    expect(s).toEqual(before);
    const q = after.players[s.current];
    expect(q.researched).toContain(node);
    expect(q.res.sci).toBe(10 - cost);
    expect(q.commandUsed).toBe(1);
  });

  it('인접 할인: 연결된 연구 노드 2개 이상이면 −1', () => {
    const s = ready();
    const p = s.players[s.current];
    const [d0, d1] = s.layout.dirOrder;
    p.researched.push(trunkId(d0, 1), trunkId(d1, 1));
    // d1:1 의 이웃 d2:1 은 d1 하나만 닿음, core 와도 닿으므로 2개
    const d2 = s.layout.dirOrder[2];
    const graph = webGraph(s.layout);
    expect(graph.adj[trunkId(d2, 1)]).toContain(CORE_ID);
    const mods = playerMods(p);
    // 연구 노드 2개(core 제외)라 증가분 0 — 1고리 줄기 기본 비용에서 인접 할인 1만 빠진다
    expect(researchCost(s, p, trunkId(d2, 1), mods)).toBe(TRUNK_BASE_COST[1] - 1);
  });

  it('곁가지 연구는 노선 점수를 준다', () => {
    const s = ready();
    const p = s.players[s.current];
    p.res.sci = 20;
    p.researched.push(trunkId('agri', 1));
    const twig = s.layout.twigs[trunkId('agri', 1)][0];
    const after = act(s, { type: 'research', node: `w:${twig}` });
    expect(after.players[s.current].doctrine[TWIG_DEFS[twig].doctrine]).toBe(TWIG_DEFS[twig].points);
  });
});

describe('곁가지 개편', () => {
  it('3고리 곁가지는 양옆 방향의 3고리 줄기를 둘 다 연구해야 열린다', () => {
    const s = ready();
    const p = s.players[s.current];
    // 학술(문화·동력 사이)의 3고리 줄기까지 연구한 상태
    p.researched.push(trunkId('academic', 3));
    const twig = `w:${s.layout.twigs[trunkId('academic', 3)][0]}`;
    s.era = 3;
    expect(researchBlock(s, p, twig)).toContain('양옆 3고리 줄기가 필요');
    p.researched.push(trunkId('culture', 3));
    expect(researchBlock(s, p, twig)).toBe('양옆 3고리 줄기가 필요: 반중력 비행');
    p.researched.push(trunkId('power', 3));
    expect(researchBlock(s, p, twig)).toBeNull();
  });

  it('1·2고리 곁가지는 양옆 줄기 없이 열린다', () => {
    const s = ready();
    const p = s.players[s.current];
    s.era = 2;
    p.researched.push(trunkId('academic', 1), trunkId('academic', 2));
    for (const ring of [1, 2]) expect(researchBlock(s, p, `w:${s.layout.twigs[trunkId('academic', ring)][0]}`)).toBeNull();
  });

  it('건물 산출 보강은 건물마다 더해진다', () => {
    const s = ready();
    const p = s.players[s.current];
    p.buildings.farm = [2, 0, 0, 0];
    const before = productionPreview(p).gross.food;
    p.researched.push('w:agri2b');
    expect(productionPreview(p).gross.food).toBe(before + 2);
  });

  it('유닛 한도는 4계열을 합친 총수다', () => {
    const s = ready();
    const p = s.players[s.current];
    p.researched.push(trunkId('defense', 1));
    p.idle = 3;
    p.res.prod = 30;
    // 총수 한도 = 4 + 2 × 방위 줄기 1 = 6. 경비대 5 + 기동대 0 이면 기동대 1대 더 가능
    p.units.guard = [5, 0, 0, 0];
    p.units.rider = [0, 0, 0, 0];
    expect(applyAction(s, s.current, { type: 'buildUnit', kind: 'rider', level: 1 }).error).toBeUndefined();
    // 경비대 5 + 기동대 1 = 6 이면 어느 계열이든 막힌다
    p.units.rider = [0, 1, 0, 0];
    expect(applyAction(s, s.current, { type: 'buildUnit', kind: 'rider', level: 1 }).error).toBe('유닛 총수 한도');
    expect(applyAction(s, s.current, { type: 'buildUnit', kind: 'guard', level: 0 }).error).toBe('유닛 총수 한도');
  });
});

describe('곁가지 구조·한도 보강', () => {
  it('곁가지 36개: 고리마다 노선 4·4·4, 한 줄기의 두 곁가지는 태그가 다르다, 3고리 이웃은 순환 이웃', () => {
    const s = ready();
    const g = webGraph(s.layout);
    const twigs = Object.values(g.nodes).filter((n) => n.kind === 'twig');
    expect(twigs).toHaveLength(36);
    const dirs = s.layout.dirOrder;
    dirs.forEach((dir, i) => {
      const nb = twigNeighborTrunks(s.layout, g.nodes[`w:${dir}3a`]);
      expect(nb.sort()).toEqual([trunkId(dirs[(i + 5) % 6], 3), trunkId(dirs[(i + 1) % 6], 3)].sort());
      expect(twigNeighborTrunks(s.layout, g.nodes[`w:${dir}2a`])).toEqual([]);
    });
  });

  it('건물 산출 보강은 역병이면 건물 생산과 함께 멈춘다', () => {
    const s = ready();
    const p = s.players[s.current];
    p.buildings.farm = [2, 0, 0, 0];
    p.researched.push('w:agri2b');
    p.idle = 0;
    p.coexist = 99; // 건강 크게 부족 → 역병
    const prev = productionPreview(p);
    expect(prev.plague).toBe(true);
    expect(prev.gross.food).toBe(0);
  });

  it('유닛 업그레이드는 총수 한도와 무관하고, 한도를 늘리는 곁가지가 있다', () => {
    const s = ready();
    const p = s.players[s.current];
    const base = unitPoolCap(p);
    p.researched.push('w:industry3a');
    expect(unitPoolCap(p)).toBe(base + 1);
    p.charters.defense = 1;
    expect(unitPoolCap(p)).toBe(base + 2);
  });
});

describe('건설', () => {
  it('해금·한도·유휴 정착민', () => {
    let s = ready();
    const pid = s.current;
    s.players[pid].res.prod = 30;
    expect(applyAction(s, pid, { type: 'build', kind: 'farm', level: 1 }).error).toBe('아직 해금되지 않은 건물');
    expect(applyAction(s, pid, { type: 'build', kind: 'farm', level: 0 }).error).toBe('농장 한도');
    s = act(s, { type: 'build', kind: 'lab', level: 0 });
    expect(s.players[pid].buildings.lab[0]).toBe(2);
    expect(s.players[pid].idle).toBe(0);
    expect(applyAction(s, pid, { type: 'build', kind: 'lab', level: 0 }).error).toBe('연구소 한도');
  });

  it('업그레이드 비용은 레벨 차액', () => {
    let s = ready();
    const pid = s.current;
    s.players[pid].res.prod = 10;
    s.players[pid].researched.push(trunkId('agri', 1));
    s = act(s, { type: 'upgrade', kind: 'farm', from: 0, to: 1 });
    expect(s.players[pid].res.prod).toBe(8);
    expect(s.players[pid].buildings.farm).toEqual([1, 1, 0, 0]);
  });
});

describe('차례와 시대', () => {
  it('차례 종료 시 생산하고 다음 플레이어로 넘어간다', () => {
    let s = ready();
    const pid = s.current;
    const before = s.players[pid].res;
    s = act(s, { type: 'endTurn' });
    expect(s.current).toBe((pid + 1) % 3);
    expect(s.players[pid].res.prod).toBe(before.prod + 2);
    expect(s.players[pid].res.sci).toBe(before.sci + 1);
  });

  it('현재 고리 줄기 합이 인원 × 시대 기준 이상이면 차례 끝에 다음 시대', () => {
    let s = ready(1, 2);
    const need = ERA_TRUNK_PER_PLAYER[1];
    for (const p of s.players) for (const d of s.layout.dirOrder.slice(0, need)) p.researched.push(trunkId(d, 1));
    // 한 개 모자라면 넘어가지 않는다
    const short = clone(s);
    short.players[0].researched.pop();
    expect(act(short, { type: 'endTurn' }).era).toBe(1);
    s = act(s, { type: 'endTurn' });
    expect(s.era).toBe(2);
    expect(s.questRow).toHaveLength(QUEST_ROW_SIZE);
    expect(s.questRow.every((c) => /^(q2|p2|l2|s2|r2|c2)/.test(c))).toBe(true);
  });

  it('2시대 기준은 인원 × ERA_TRUNK_PER_PLAYER[2] 올림', () => {
    let s = ready(1, 2);
    s.era = 2;
    const total = Math.ceil(2 * ERA_TRUNK_PER_PLAYER[2]);
    const each = [Math.ceil(total / 2), Math.floor(total / 2)];
    s.players.forEach((p, i) => {
      for (const d of s.layout.dirOrder.slice(0, each[i])) p.researched.push(trunkId(d, 1), trunkId(d, 2));
    });
    const short = clone(s);
    short.players[0].researched.pop();
    expect(act(short, { type: 'endTurn' }).era).toBe(2);
    s = act(s, { type: 'endTurn' });
    expect(s.era).toBe(3);
  });

  it('endRound 가 없는 옛 저장은 예고된 그 라운드 끝에 끝난다', () => {
    let s = ready(1, 2);
    s.endTriggered = true;
    delete s.endRound;
    const round = s.round;
    // 시작 플레이어부터 두 사람의 차례를 끝까지 넘긴다
    let guard = 0;
    while (!s.gameOver && guard++ < 50) {
      if (s.pending.length) s = applyAction(s, s.pending[0].player, { type: 'respond', choice: 0 }).state;
      else if (s.phase === 'quest') s = act(s, { type: 'pickQuest', slot: Math.max(0, s.questRow.findIndex((_, i) => !pickBlock(s, s.players[s.current], i))) });
      else s = act(s, { type: 'endTurn' });
    }
    expect(s.gameOver).toBe(true);
    expect(s.round).toBe(round);
  });

  it('합성 단계 3은 연구 비용 −1', () => {
    const s = ready(1, 2);
    const p = s.players[0];
    const node = trunkId(s.layout.dirOrder[0], 1);
    const before = researchCost(s, p, node, playerMods(p));
    p.doctrine.synth = 12;
    expect(stage(p, 'synth')).toBe(3);
    expect(researchCost(s, p, node, playerMods(p))).toBe(Math.max(1, before - 1));
  });

  it('종료 시대: 결실 퀘스트가 칸 1에 들어오면 그 라운드와 한 라운드를 더 마치고 종료', () => {
    let s = ready(3, 2);
    s.era = 3;
    advanceEra(s);
    expect(s.era).toBe(4);
    expect(s.questRow.every((id) => QUEST_DEFS[id]?.kind !== 'fruition')).toBe(true);
    expect(s.questDecks[4]).toHaveLength(4);
    let guard = 0;
    let triggerRound = 0;
    while (!s.gameOver && guard++ < 200) {
      if (s.pending.length) s = applyAction(s, s.pending[0].player, { type: 'respond', choice: 0 }).state;
      else if (s.phase === 'quest') s = act(s, { type: 'pickQuest', slot: Math.max(0, s.questRow.findIndex((_, i) => !pickBlock(s, s.players[s.current], i))) });
      else s = act(s, { type: 'endTurn' });
      if (s.endTriggered && !triggerRound) triggerRound = s.round;
    }
    expect(s.gameOver).toBe(true);
    expect(s.endTriggered).toBe(true);
    // 예고된 라운드 다음 라운드까지 모두 같은 차례 수를 두고 끝난다
    expect(s.endRound).toBe(triggerRound + 1);
    expect(s.round).toBe(triggerRound + 1);
    expect(s.current).toBe(s.startPlayer);
  });
});

describe('자리 보정', () => {
  it('인원별 표를 읽고 문화는 주지 않는다', () => {
    for (const n of [2, 3, 4]) {
      const s = createGame(7, Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isAI: true })));
      s.players.forEach((p) => {
        const seat = (p.id - s.startPlayer + n) % n;
        const b = SEAT_BONUS[n][seat];
        expect(p.res.prod).toBe(START_RES.prod + (b.prod ?? 0));
        expect(p.res.sci).toBe(START_RES.sci + (b.sci ?? 0));
        expect(p.res.culture).toBe(START_RES.culture);
      });
    }
  });
});

describe('건강과 역병', () => {
  it('정착민 공급 트랙: 구간 값을 그대로 읽는다', () => {
    expect(colonistTrack(6)).toMatchObject({ food: 0, health: 0 });
    expect(colonistTrack(7)).toMatchObject({ food: 1, health: 0 });
    expect(colonistTrack(10)).toMatchObject({ food: 1, health: 1 });
    expect(colonistTrack(11)).toMatchObject({ food: 2, health: 2 });
    expect(colonistTrack(24)).toMatchObject({ food: 4, health: 8 });
    // 구간이 1~24를 빈틈없이 덮고 값이 줄지 않는다
    expect(COLONIST_TRACK[COLONIST_TRACK.length - 1].upTo).toBe(COLONIST_TOTAL);
    expect(colonistTrack(0)).toMatchObject({ food: 0, health: 0 });
    expect(colonistTrack(COLONIST_TOTAL + 1)).toBe(COLONIST_TRACK[COLONIST_TRACK.length - 1]);
    for (let i = 1; i < COLONIST_TRACK.length; i++) {
      expect(COLONIST_TRACK[i].health).toBeGreaterThanOrEqual(COLONIST_TRACK[i - 1].health);
      expect(COLONIST_TRACK[i].food).toBeGreaterThanOrEqual(COLONIST_TRACK[i - 1].food);
    }
  });

  it('필요 건강은 배치+유휴 총수 기준', () => {
    const s = ready();
    const p = s.players[0];
    p.idle += 4; // 시작 7명 → 11명
    p.pool -= 4;
    expect(requiredHealth(p)).toBe(2);
  });

  /** 총 11명(필요 건강 2), 유휴 5명. 공존 토큰으로 불건강 수를 맞춘다 */
  function sickSetup(sick: number): GameState {
    const s = clone(ready());
    const p = s.players[0];
    p.res.energy = 0;
    p.coexist = 0;
    p.pool -= 5 - p.idle;
    p.idle = 5;
    p.coexist = sick - requiredHealth(p) + health(p);
    expect(unhealthy(p)).toBe(sick);
    return s;
  }

  it('불건강 ≤ 유휴면 생산 정상', () => {
    const p = sickSetup(5).players[0];
    expect(requiredHealth(p)).toBe(2);
    expect(plague(p)).toBe(false);
    expect(productionPreview(p).gross.food).toBeGreaterThan(playerMods(p).income.food ?? 0);
  });

  it('유휴 0: 불건강 0이면 무사, 1이면 역병', () => {
    const s = sickSetup(0);
    const p = s.players[0];
    p.idle = 0;
    p.pool += 5; // 총 6명 → 필요 건강 0
    p.coexist = 0;
    p.coexist = health(p) - requiredHealth(p);
    expect(unhealthy(p)).toBe(0);
    expect(plague(p)).toBe(false);
    p.coexist += 1;
    expect(plague(p)).toBe(true);
  });

  it('역병이 아니면 역병 기록이 없다', () => {
    const s = sickSetup(5);
    produce(s, s.players[0]);
    expect(s.log.some((e) => e.text.startsWith('역병'))).toBe(false);
  });

  it('AI: 공존하면 역병이 될 때는 처치를 고른다', () => {
    const s = sickSetup(5);
    s.pending = [{ kind: 'coexist', player: 0, questId: 'q1t1' }];
    expect(chooseAction(s, 0)).toEqual({ type: 'respond', choice: 0 });
  });

  it('불건강 > 유휴면 역병: 건물 생산만 멈추고 보너스·식량 소비는 그대로', () => {
    const s = sickSetup(6);
    const p = s.players[0];
    const mods = playerMods(p);
    const pv = productionPreview(p);
    expect(pv.plague).toBe(true);
    expect(pv.gross.food).toBe(mods.income.food ?? 0);
    expect(pv.gross.sci).toBe(mods.income.sci ?? 0);
    expect(pv.upkeep).toBe(Math.max(0, colonistTrack(11).food - mods.foodUpkeep));
    const sci = p.res.sci;
    produce(s, p);
    expect(p.res.sci).toBe(sci + (mods.income.sci ?? 0));
    expect(s.log.some((e) => e.player === 0 && e.text.startsWith('역병'))).toBe(true);
  });
});

describe('퀘스트', () => {
  it('판정형: 고른 사람만 검사해 만족하면 보상 선택 대기', () => {
    const s = atQuest('q1j1');
    const me = s.current;
    s.players.forEach((p) => (p.buildings.farm[0] = 3));
    const after = act(s, { type: 'pickQuest', slot: 0 });
    expect(after.pending).toEqual([{ kind: 'questReward', player: me, questId: 'q1j1' }]);
  });

  it('위협형: 방어값이 모자라면 손실, 넘으면 처치', () => {
    const s = atQuest('q1t5'); // 전원, 위협도 3, 손실 식량 1
    s.players.forEach((p) => (p.res.food = 5));
    s.players[1].units.guard[3] = 2; // 방어값 크게
    const after = act(s, { type: 'pickQuest', slot: 0 });
    expect(defenseValue(after.players[0])).toBeLessThan(3);
    expect(after.players[0].res.food).toBe(4);
    expect(after.players[1].res.food).toBe(5 + 1);
  });

  it('위협형은 고른 사람이 아니라 카드의 대상에게 발동한다', () => {
    const s = atQuest('q1t1'); // 방위력 최저 1명, 손실 식량 2
    const me = s.current;
    const other = (me + 1) % 3;
    s.players.forEach((p) => (p.res.food = 5));
    s.players[me].units.guard[3] = 2;
    s.players[(me + 2) % 3].units.guard[3] = 2;
    const after = act(s, { type: 'pickQuest', slot: 0 });
    expect(after.players[other].res.food).toBe(3);
    expect(after.players[me].res.food).toBe(5);
  });

  it('퀘스트 선택: 고른 칸을 빼고 뒤를 당긴 뒤 덱에서 칸 5를 채운다', () => {
    let s = createGame(1, seats(3));
    const row = [...s.questRow];
    const next = s.questDecks[1][0];
    s = act(s, { type: 'pickQuest', slot: 2 });
    expect(s.questRow).toEqual([row[0], row[1], row[3], row[4], next]);
  });

  /** 퀘스트 선택 단계의 게임에 트랙을 직접 놓는다(차례 시작 칸 1도 맞춤) */
  const withRow = (row: string[]) => {
    const s = createGame(1, seats(3));
    s.questRow = [...row];
    s.questOpen = row.map(() => false);
    s.turnFront = row[0];
    return s;
  };
  /** 대외 단계부터 차례를 끝낼 때까지 아무 행동 없이 넘긴다 */
  const finishTurn = (s: GameState) => act(s, { type: 'endTurn' });

  it('트랙 밀기: 칸 2~5를 고르면 차례 끝에 칸 1도 밀림 더미로 가서 2칸 움직인다', () => {
    let s = withRow(['s1f', 's1p', 's1e', 's1s', 's1c']);
    const row = [...s.questRow];
    const deck = [...s.questDecks[1]];
    s = act(s, { type: 'pickQuest', slot: 2 });
    s = finishTurn(s);
    expect(s.questDiscard).toEqual([row[0]]);
    expect(s.questRow).toEqual([row[1], row[3], row[4], deck[0], deck[1]]);
  });

  it('트랙 밀기: 칸 1을 고르면 1칸만 움직이고 밀림 더미는 그대로', () => {
    let s = withRow(['s1f', 's1p', 's1e', 's1s', 's1c']);
    const row = [...s.questRow];
    const deck = [...s.questDecks[1]];
    s = act(s, { type: 'pickQuest', slot: 0 });
    s = finishTurn(s);
    expect(s.questDiscard).toEqual([]);
    expect(s.questRow).toEqual([row[1], row[2], row[3], row[4], deck[0]]);
  });

  it('트랙 밀기: 칸 1·2가 같은 카드 사본이어도 칸 1을 고르면 1칸만 움직인다', () => {
    let s = withRow(['s1f', 's1f', 's1e', 's1s', 's1c']);
    const deck = [...s.questDecks[1]];
    s = act(s, { type: 'pickQuest', slot: 0 });
    s = finishTurn(s);
    expect(s.questDiscard).toEqual([]);
    expect(s.questRow).toEqual(['s1f', 's1e', 's1s', 's1c', deck[0]]);
  });

  it('트랙 밀기: 덱이 떨어지면 밀림 더미를 섞어 새 덱으로 놓는다', () => {
    let s = withRow(['s1f', 's1p', 's1e', 's1s', 's1c']);
    s.questDecks[1] = [];
    s.questDiscard = ['s1m', 's1d', 's1f'];
    // 고른 칸을 채울 때 덱이 비어 더미 3장을 섞어 새 덱으로 놓고 1장을 쓴다
    s = act(s, { type: 'pickQuest', slot: 1 });
    expect(s.questRow).toHaveLength(QUEST_ROW_SIZE);
    expect(s.questDecks[1]).toHaveLength(2);
    expect(s.questDiscard).toEqual([]);
    // 차례 끝 밀기: 칸 1 카드는 새 밀림 더미로, 남은 덱에서 1장을 채운다
    s = finishTurn(s);
    expect(s.era).toBe(1);
    expect(s.questDiscard).toEqual(['s1f']);
    expect(s.questDecks[1]).toHaveLength(1);
    expect(s.questRow).toHaveLength(QUEST_ROW_SIZE);
  });

  it('종료 시대에는 트랙을 밀지 않는다', () => {
    let s = createGame(1, seats(3));
    advanceEra(s);
    advanceEra(s);
    advanceEra(s);
    expect(s.era).toBe(4);
    s.questRow = ['s3f', 's3p', 's3e', 's3s', 's3c'];
    s.questOpen = s.questRow.map(() => false);
    s.turnFront = 's3f';
    s.phase = 'quest';
    s = act(s, { type: 'pickQuest', slot: 2 });
    s = finishTurn(s);
    expect(s.questDiscard).toEqual([]);
    expect(s.questRow.slice(0, 4)).toEqual(['s3f', 's3p', 's3s', 's3c']);
  });

  it('덱과 밀림 더미가 모두 비어야 덱 소진으로 시대가 넘어간다', () => {
    let s = createGame(1, seats(2));
    s.questDecks[1] = [];
    s.questDiscard = [];
    s = act(s, { type: 'pickQuest', slot: 1 });
    s = finishTurn(s);
    expect(s.era).toBe(2);
    expect(s.questDiscard).toEqual([]);
  });

  it('퀘스트 선택 전에는 다른 행동이 막히고, 한 차례에 한 번만 고른다', () => {
    let s = atQuest('s1f');
    expect(applyAction(s, s.current, { type: 'endTurn' }).error).toBe('먼저 퀘스트를 고르세요');
    s = act(s, { type: 'pickQuest', slot: 0 });
    expect(s.phase).toBe('external');
    expect(s.players[s.current].hand.map((h) => h.id)).toEqual(['s1f']);
    expect(applyAction(s, s.current, { type: 'pickQuest', slot: 0 }).error).toBeTruthy();
  });

  it('뒷면 카드도 고를 수 있고, 시야만큼 칸 2부터 본인만 본다', () => {
    const s = atQuest('p1a', 3);
    const me = s.current;
    expect(slotVisible(s, me, 0)).toBe(true);
    expect(slotVisible(s, me, 1)).toBe(false);
    s.players[me].orbit.push({ id: 'sa1', timer: 3 });
    expect(slotVisible(s, me, 1)).toBe(true);
    expect(slotVisible(s, me, 2)).toBe(false);
    expect(slotVisible(s, (me + 1) % 3, 1)).toBe(false);
    const after = act(s, { type: 'pickQuest', slot: 3 });
    expect(after.players[me].pioneer).toBe('p1a');
  });

  it('가져올 수 없는 카드: 보이면 못 고르고, 뒷면으로 고르면 버려진다', () => {
    const s = atQuest('p1s', 0);
    s.questRow[2] = 'p1y';
    s.players[s.current].pioneerEras = [1];
    expect(applyAction(s, s.current, { type: 'pickQuest', slot: 0 }).error).toBe('이번 시대에 이미 후원자를 들였습니다');
    const after = act(s, { type: 'pickQuest', slot: 2 });
    expect(after.players[s.current].pioneer).toBeNull();
    expect(after.questRow).not.toContain('p1y');
  });

  it('뒷면 종료 묶음 카드를 고르면 뒤집어 두고 다시 고른다', () => {
    let s = atQuest('e_ark', 2);
    s = act(s, { type: 'pickQuest', slot: 2 });
    expect(s.phase).toBe('quest');
    expect(s.questOpen[2]).toBe(true);
    expect(applyAction(s, s.current, { type: 'pickQuest', slot: 2 }).error).toBe('종료 묶음 카드는 고를 수 없습니다');
  });

  it('뒷면이 모두 종료 묶음이어도 건너뛰지 않고(정체 누출 없음), 다 뒤집혀 고를 칸이 없으면 대외 단계로', () => {
    let s = createGame(1, seats(2));
    s.questRow = ['e_ark', 'e_symbiont', 'e_synth'];
    s.questOpen = [false, false, false];
    s.phase = 'quest';
    s = act(s, { type: 'pickQuest', slot: 1 });
    expect(s.phase).toBe('quest');
    s = act(s, { type: 'pickQuest', slot: 2 });
    expect(s.phase).toBe('external');
  });

  it('덱이 바닥나 트랙을 다 채우지 못하면 차례 끝에 다음 시대', () => {
    let s = createGame(1, seats(2));
    s.questDecks[1] = [];
    s.questRow[0] = 's1f';
    s = act(s, { type: 'pickQuest', slot: 0 });
    expect(s.questRow).toHaveLength(QUEST_ROW_SIZE - 1);
    s = act(s, { type: 'endTurn' });
    expect(s.era).toBe(2);
    expect(s.questRow).toHaveLength(QUEST_ROW_SIZE);
  });

  it('종료 시대 진입 때 3시대 덱이 5장보다 적으면 나머지 칸을 종료 묶음으로 채운다', () => {
    const s = createGame(1, seats(2));
    s.era = 3;
    s.questDecks[3] = ['s3f', 's3p'];
    advanceEra(s);
    expect(s.questRow.slice(0, 2)).toEqual(['s3f', 's3p']);
    expect(s.questRow.slice(2).every((id) => id.startsWith('e_'))).toBe(true);
    expect(s.questDecks[4]).toHaveLength(1);
  });

  it('종료 시대의 후원자는 3시대와 같은 시대로 센다', () => {
    const s = atQuest('p3a');
    s.era = 4;
    s.players[s.current].pioneerEras = [3];
    expect(applyAction(s, s.current, { type: 'pickQuest', slot: 0 }).error).toBe('이번 시대에 이미 후원자를 들였습니다');
  });

  it('AI 퀘스트 선택은 시야 밖 칸의 정체에 따라 달라지지 않는다', () => {
    const a = createGame(3, seats(3));
    const b = clone(a);
    b.questRow[3] = a.questRow[3] === 's1f' ? 's1p' : 's1f';
    b.questRow[4] = 'q1t4';
    b.questDecks[1] = [...a.questDecks[1]].reverse();
    expect(chooseAction(b, b.current)).toEqual(chooseAction(a, a.current));
  });

  it('주둔지 제안: 지표 최고 플레이어에게 먼저 묻고 거절하면 다음 사람', () => {
    let s = atQuest('q1p1');
    const patronId = s.patronDecks[1][0];
    s = act(s, { type: 'pickQuest', slot: 0 });
    const pd = s.pending[0];
    expect(pd.kind).toBe('patron');
    const first = pd.player;
    s = applyAction(s, first, { type: 'respond', choice: 0 }).state;
    expect(s.pending[0]?.player).not.toBe(first);
    s = applyAction(s, s.pending[0].player, { type: 'respond', choice: 1 }).state;
    expect(s.players.some((p) => p.patrons.includes(patronId))).toBe(true);
  });

  it('방위력 최저 동점이면 고른 사람의 다음 자리가 대상, 고른 사람은 마지막', () => {
    const s = atQuest('q1t1'); // 방위력 최저 1명, 손실 식량 2
    const me = s.current;
    s.players.forEach((p) => (p.res.food = 5)); // 모두 방위력 같음
    const after = act(s, { type: 'pickQuest', slot: 0 });
    expect(after.players[(me + 1) % 3].res.food).toBe(3);
    expect(after.players[me].res.food).toBe(5);
    expect(after.players[(me + 2) % 3].res.food).toBe(5);
  });

  it('개척 만찬: 식량 기준 이상일 때 차례당 1회, 지휘 없이 식량 → 문화', () => {
    const s = ready();
    s.round = 2; // 첫 라운드 지휘 제한을 피한다
    const me = s.current;
    s.players[me].res.food = FEAST_MIN_FOOD - 1;
    s.players[me].res.culture = 0;
    expect(applyAction(s, me, { type: 'feast' }).error).toContain('이상일 때만');
    s.players[me].res.food = FEAST_KEEP_FOOD + 3 * FEAST_FOOD + 2; // 3묶음 + 나머지 2
    const after = act(s, { type: 'feast' });
    expect(after.players[me].res.food).toBe(FEAST_KEEP_FOOD + 2);
    expect(after.players[me].res.culture).toBe(3 * FEAST_CULTURE);
    expect(after.players[me].commandUsed).toBe(s.players[me].commandUsed); // 지휘를 쓰지 않음
    expect(applyAction(after, me, { type: 'feast' }).error).toBe('개척 만찬은 차례당 한 번입니다');
  });

  it('개척 만찬: 다음 차례에 다시 할 수 있고, feasted 가 없는 옛 저장도 된다', () => {
    let s = ready();
    s.round = 2;
    const me = s.current;
    delete s.players[me].feasted; // 옛 저장
    s.players[me].res.food = 30;
    s = act(s, { type: 'feast' });
    expect(s.players[me].feasted).toBe(true);
    s = act(s, { type: 'endTurn' });
    expect(s.players[me].feasted).toBe(true); // 내 차례가 다시 올 때 풀린다
    while (s.current !== me || s.pending.length) {
      const actor = s.pending.length ? s.pending[0].player : s.current;
      s = act(s, chooseAction(s, actor) ?? { type: 'endTurn' }, actor);
    }
    expect(s.players[me].feasted).toBe(false);
  });

  it('AI 는 할 행동이 없을 때 남는 식량으로 만찬을 하고, 대외 단계에서도 한다', () => {
    for (const phase of ['actions', 'external'] as const) {
      const s = ready();
      s.round = 2;
      s.phase = phase;
      const me = s.current;
      const p = s.players[me];
      p.res = { food: 40, prod: 0, energy: 0, sci: 0, culture: 0 };
      p.pool = 0;
      p.hand = [];
      p.commandUsed = 99; // 지휘 바닥
      p.defenseUsed = 99;
      expect(chooseAction(s, me)).toEqual({ type: 'feast' });
    }
  });

  it('방위력 하위 2명 동점이면 고른 사람의 다음 두 자리가 대상', () => {
    const s = atQuest('q1t3'); // 하위 2명, 위협도 4, 손실 생산 2
    const me = s.current;
    s.players.forEach((p) => (p.res.prod = 5));
    const after = act(s, { type: 'pickQuest', slot: 0 });
    expect(after.players[(me + 1) % 3].res.prod).toBe(3);
    expect(after.players[(me + 2) % 3].res.prod).toBe(3);
    expect(after.players[me].res.prod).toBe(5);
  });

  it('주둔지 종료 검사는 라운드 상한으로 일찍 끝나도 시대 3으로 셈한다', () => {
    const s = createGame(1, seats(3));
    s.era = 2;
    s.players[0].patrons = ['pa9']; // 요구 방주 10
    s.players[0].doctrine.ark = 10;
    s.players[0].res.culture = 0;
    checkPatronDemands(s, s.era, true);
    expect(s.players[0].res.culture).toBe(3 * PATRON_MET_CULTURE_PER_ERA);
  });

  it('중계 위성은 위성 시야 +1 에 더해 시야 +1(합 2)', () => {
    const s = createGame(1, seats(3));
    s.players[0].orbit = [{ id: 'sa3', timer: 3 }];
    expect(sight(s.players[0])).toBe(2);
  });

  it('주둔지 요구: 받은 시대가 끝날 때는 면제, 다음 시대 전환과 종료 때 검사', () => {
    const s = createGame(1, seats(3));
    s.players[0].patrons = ['pa1']; // 1시대 카드, 요구 제작소 3
    s.players[0].res.culture = 10;
    checkPatronDemands(s, 1);
    expect(s.players[0].res.culture).toBe(10);
    checkPatronDemands(s, 2);
    expect(s.players[0].res.culture).toBe(10 - PATRON_FAIL_CULTURE);
    s.players[1].patrons = ['pa9']; // 3시대 카드: 3→4 전환은 면제, 종료 검사만
    s.players[1].res.culture = 10;
    checkPatronDemands(s, 3);
    expect(s.players[1].res.culture).toBe(10);
    checkPatronDemands(s, 4, true);
    expect(s.players[1].res.culture).toBe(10 - PATRON_FAIL_CULTURE);
  });
});

describe('대외 단계', () => {
  it('습격 성공 시 약탈하고 같은 라운드 재표적 불가', () => {
    let s = ready(1, 3);
    const me = s.current;
    const t = (me + 1) % 3;
    s.players[me].units.guard[3] = 3;
    s.players[t].res.prod = 9;
    s.players[me].hand = [{ id: 'r1a', fresh: false }, { id: 'r1b', fresh: false }];
    s = act(s, { type: 'raid', card: 0, target: t, effect: 'lootProd' });
    expect(s.players[t].res.prod).toBe(9 - 3);
    expect(s.players[t].harmedRound).toBe(s.round);
    expect(s.phase).toBe('actions');
    expect(s.players[me].hand.map((h) => h.id)).toEqual(['r1b']);
    expect(applyAction(s, me, { type: 'raid', card: 0, target: (me + 2) % 3, effect: 'stealSci' }).error).toBe('대외 단계가 지났습니다');
  });

  it('습격은 손의 습격 카드가 있어야 하고, 카드에 적힌 효과만 고른다', () => {
    const s = ready(1, 3);
    const me = s.current;
    const t = (me + 1) % 3;
    s.players[me].units.guard[3] = 3;
    const p = s.players[me];
    expect(applyAction(s, me, { type: 'raid', card: 0, target: t, effect: 'lootProd' }).error).toBe('없는 카드');
    p.hand = [{ id: 's1f', fresh: false }];
    expect(applyAction(s, me, { type: 'raid', card: 0, target: t, effect: 'lootProd' }).error).toBe('습격 카드가 아닙니다');
    p.hand = [{ id: 'r1a', fresh: true }];
    expect(applyAction(s, me, { type: 'raid', card: 0, target: t, effect: 'lootProd' }).error).toBe('가져온 차례에는 쓸 수 없습니다');
    p.hand = [{ id: 'r1a', fresh: false }];
    expect(applyAction(s, me, { type: 'raid', card: 0, target: t, effect: 'stealSci' }).error).toBe('이 카드로 고를 수 없는 효과입니다');
  });

  it('습격 카드의 공격 보정과 추가량이 적용된다', () => {
    let s = ready(1, 2);
    const me = s.current;
    const t = 1 - me;
    s.era = 2;
    s.players[t].res.sci = 20;
    s.players[me].hand = [{ id: 'r2b', fresh: false }]; // 공격 +2, 추가량 +1
    // 방위력 0 대 0: 카드 보정 +2 로 성공
    s.players[t].units.guard = [0, 0, 0, 0];
    s.players[me].units.guard = [0, 0, 0, 0];
    s = act(s, { type: 'raid', card: 0, target: t, effect: 'stealSci' });
    expect(s.players[t].res.sci).toBe(20 - (2 + 2 + 1));
  });

  it('분쟁은 2시대부터, 다음 차례에 판정', () => {
    let s = ready(1, 2);
    const me = s.current;
    const t = 1 - me;
    s.players[me].hand = [{ id: 'c2a', fresh: false }];
    expect(applyAction(s, me, { type: 'declareConflict', card: 0, target: t }).error).toBe('분쟁은 2시대부터');
    s.era = 2;
    s.players[me].units.guard[3] = 3;
    s.players[me].researched.push(trunkId('defense', 1), trunkId('defense', 2));
    s.players[t].res.culture = 10;
    s = act(s, { type: 'declareConflict', card: 0, target: t });
    expect(s.players[me].hand).toEqual([]);
    expect(s.players[me].conflict?.loss).toBe('culture');
    s = act(s, { type: 'endTurn' });
    s.questRow[0] = 's1f';
    s = act(s, { type: 'pickQuest', slot: 0 }, t);
    s = act(s, { type: 'endTurn' }, t);
    // 분쟁 판정은 내 퀘스트 선택 뒤에 일어난다
    expect(s.players[t].res.culture).toBe(10);
    s.questRow[0] = 's1p';
    s = act(s, { type: 'pickQuest', slot: 0 }, me);
    expect(s.players[t].res.culture).toBeLessThan(10);
  });
});

describe('점수', () => {
  it('결실 정산: 단계 × 3 + 단계 4 선착 보너스', () => {
    const s = ready();
    const p = s.players[0];
    p.doctrine.ark = 16;
    s.stage4Order.ark = [0];
    expect(stage(p, 'ark')).toBe(4);
    const sc = scorePlayer(s, p);
    expect(sc.fruition).toBe(4 * 3 + 6);
  });
});

describe('AI 전체 게임', () => {
  it('2인 AI 게임이 끝까지 진행된다', () => {
    let s = createGame(11, seats(2));
    let steps = 0;
    while (!s.gameOver && steps++ < 20000) {
      const actor = s.pending.length ? s.pending[0].player : s.current;
      const a = chooseAction(s, actor)!;
      const r = applyAction(s, actor, a);
      s = r.error ? applyAction(s, actor, { type: 'endTurn' }).state : r.state;
    }
    expect(s.gameOver).toBe(true);
    expect(s.round).toBeGreaterThan(10);
  }, 60000);
});

describe('가림', async () => {
  const { maskFor, HIDDEN } = await import('../mask');
  it('덱·시야 밖 뒷면 칸·시드를 가린다', () => {
    const s = ready();
    s.players[0].orbit.push({ id: 'sa1', timer: 3 });
    const m = maskFor(s, 0);
    expect(m.questRow.slice(0, 2)).toEqual(s.questRow.slice(0, 2));
    expect(m.questRow.slice(2).every((x) => x === HIDDEN)).toBe(true);
    expect(m.questDecks[1].every((x) => x === HIDDEN)).toBe(true);
    expect(m.rngState).toEqual([0, 0, 0, 0]);
    expect(maskFor(s, 1).questRow[1]).toBe(HIDDEN);
    expect(maskFor(s, null).questRow[0]).toBe(s.questRow[0]);
    expect(m.endBundle.filter((x) => x === HIDDEN)).toHaveLength(1);
  });
});
