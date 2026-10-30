import { describe, expect, it } from 'vitest';
import { createGame } from './setup';
import { applyAction, runSteps } from './turn';
import { webGraph, researchCost, researchBlock } from './research';
import { advanceEraStart } from './era';
import { advanceTrack, processQuest } from './quest';
import { defenseValue, playerMods, stage } from './derive';
import { scorePlayer } from './scoring';
import { chooseAction } from '../ai';
import { TWIG_DEFS, trunkId, CORE_ID } from '../data/techWeb';
import { QUEST_DEFS } from '../data/quests';
import { clone } from './util';
import type { Action, GameState } from '../types';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isAI: true }));

/** 임무 선택 대기를 모두 처리한 게임 */
function ready(seed = 1, n = 3): GameState {
  let s = createGame(seed, seats(n));
  while (s.pending.length) s = applyAction(s, s.pending[0].player, { type: 'respond', choice: 0 }).state;
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
    expect(createGame(7, seats(3)).layout).not.toEqual(createGame(8, seats(3)).layout);
  });

  it('테크 웹 배치 제약: 농업 고정, 한 줄기 곁가지 노선이 다름, 고리별 노선 4개씩', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { layout } = createGame(seed, seats(2));
      expect(layout.dirOrder[0]).toBe('agri');
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

  it('임무 3장 중 2장을 남긴다', () => {
    const s = ready();
    for (const p of s.players) expect(p.missions).toHaveLength(2);
  });

  it('대기 결정 중에는 다른 행동이 막힌다', () => {
    const s = createGame(1, seats(2));
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
    expect(researchCost(s, p, trunkId(d2, 1), mods)).toBe(3 - 1);
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

  it('현재 고리 줄기 합이 인원 × 3 이상이면 차례 끝에 다음 시대', () => {
    let s = ready(1, 2);
    for (const p of s.players) for (const d of s.layout.dirOrder.slice(0, 3)) p.researched.push(trunkId(d, 1));
    s = act(s, { type: 'endTurn' });
    expect(s.era).toBe(2);
    expect(s.cardRow.every((c) => !c || c.startsWith('p2') || c.startsWith('l2') || c.startsWith('s2'))).toBe(true);
  });

  it('종료 시대: 결실 퀘스트가 칸 1에 들어오면 그 라운드 끝에 종료', () => {
    let s = ready(3, 2);
    s.era = 3;
    advanceEraStart(s);
    runSteps(s);
    expect(s.era).toBe(4);
    expect(s.questSlots.every((id) => !id || QUEST_DEFS[id].kind !== 'fruition')).toBe(true);
    let guard = 0;
    while (!s.gameOver && guard++ < 200) {
      if (s.pending.length) s = applyAction(s, s.pending[0].player, { type: 'respond', choice: 0 }).state;
      else s = act(s, { type: 'endTurn' });
    }
    expect(s.gameOver).toBe(true);
    expect(s.endTriggered).toBe(true);
  });
});

describe('퀘스트', () => {
  it('판정형: 조건을 만족한 사람마다 보상 선택 대기', () => {
    const s = ready();
    s.players[0].buildings.farm[0] = 3;
    processQuest(s, 'q1j1', 0);
    expect(s.pending.map((p) => p.player)).toEqual([0]);
  });

  it('위협형: 방어값이 모자라면 손실, 넘으면 처치', () => {
    const s = ready();
    s.players.forEach((p) => (p.res.food = 5));
    s.players[1].units.guard[3] = 2; // 방어값 크게
    processQuest(s, 'q1t5', 0); // 전원, 위협도 3, 손실 식량 1
    runSteps(s);
    expect(defenseValue(s.players[0])).toBeLessThan(3);
    expect(s.players[0].res.food).toBe(4);
    expect(s.players[1].res.food).toBe(5 + 1);
  });

  it('트랙 진행은 칸 1을 처리하고 한 칸씩 당긴다', () => {
    const s = ready();
    const [a, b] = s.questSlots;
    const next = s.questFuture[0];
    advanceTrack(s, 0);
    expect(s.questSlots).toEqual([b, next]);
    expect(s.questSlots).not.toContain(a);
  });

  it('후원 제안: 지표 최고 플레이어에게 먼저 묻고 거절하면 다음 사람', () => {
    let s = ready();
    const patronId = s.patronDecks[1][0];
    processQuest(s, 'q1p1', 0);
    const pd = s.pending[0];
    expect(pd.kind).toBe('patron');
    const first = pd.player;
    s = applyAction(s, first, { type: 'respond', choice: 0 }).state;
    expect(s.pending[0]?.player).not.toBe(first);
    s = applyAction(s, s.pending[0].player, { type: 'respond', choice: 1 }).state;
    expect(s.players.some((p) => p.patrons.includes(patronId))).toBe(true);
  });
});

describe('대외 단계', () => {
  it('습격 성공 시 약탈하고 같은 라운드 재표적 불가', () => {
    let s = ready(1, 3);
    const me = s.current;
    const t = (me + 1) % 3;
    s.players[me].units.guard[3] = 3;
    s.players[t].res.prod = 9;
    s = act(s, { type: 'raid', target: t, effect: 'lootProd' });
    expect(s.players[t].res.prod).toBe(9 - 3);
    expect(s.players[t].harmedRound).toBe(s.round);
    expect(s.phase).toBe('actions');
    expect(applyAction(s, me, { type: 'pullTrack' }).error).toBe('대외 단계가 지났습니다');
  });

  it('분쟁은 2시대부터, 다음 차례에 판정', () => {
    let s = ready(1, 2);
    const me = s.current;
    const t = 1 - me;
    expect(applyAction(s, me, { type: 'declareConflict', target: t, loss: 'culture' }).error).toBe('분쟁은 2시대부터');
    s.era = 2;
    s.players[me].units.guard[3] = 3;
    s.players[me].researched.push(trunkId('defense', 1), trunkId('defense', 2));
    s.players[t].res.culture = 10;
    s = act(s, { type: 'declareConflict', target: t, loss: 'culture' });
    s = act(s, { type: 'endTurn' });
    s = act(s, { type: 'endTurn' }, t);
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
  it('다른 사람 임무·덱·시야 밖 미래 퀘스트·시드를 가린다', () => {
    const s = ready();
    s.players[0].orbit.push({ id: 'sa3', timer: 3 });
    const m = maskFor(s, 0);
    expect(m.players[0].missions).toEqual(s.players[0].missions);
    expect(m.players[1].missions.every((x) => x === HIDDEN)).toBe(true);
    expect(m.questFuture[0]).toBe(s.questFuture[0]);
    expect(m.questFuture[1]).toBe(HIDDEN);
    expect(m.cardDecks[1].every((x) => x === HIDDEN)).toBe(true);
    expect(m.rngState).toBe(0);
    expect(maskFor(s, 1).questFuture[0]).toBe(HIDDEN);
    expect(m.endBundle.filter((x) => x === HIDDEN)).toHaveLength(1);
  });
});
