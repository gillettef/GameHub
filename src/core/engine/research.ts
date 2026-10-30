// 테크 웹: 배치 생성, 노드·연결선, 연구 가능 여부와 비용 (Rules.md 6절)
import { DIRECTIONS, type Direction, type GameState, type PlayerState, type Ring, type TechNode, type WebLayout } from '../types';
import type { Rng } from '../rng';
import { RESEARCH_STEP, TRUNK_BASE_COST, TWIG_BASE_COST, TWIG_POOL_PICK_PER_DOCTRINE } from '../data/constants';
import { CORE_ID, TWIG_DEFS, TWIG_POOLS, trunkId, twigNodeId } from '../data/techWeb';

/** 방향 순서(농업 고정) → 곁가지 배치 순서로 RNG 를 쓴다 */
export function generateLayout(rng: Rng): WebLayout {
  const rest = rng.shuffle(DIRECTIONS.filter((d) => d !== 'agri'));
  const dirOrder: Direction[] = ['agri', ...rest];
  const twigs: Record<string, string[]> = {};
  for (const ring of [1, 2, 3] as Ring[]) {
    const pool = TWIG_POOLS[ring];
    const picked: string[] = [];
    for (const d of ['ark', 'symbiont', 'synth'] as const) {
      picked.push(...rng.shuffle(pool.filter((t) => t.doctrine === d)).slice(0, TWIG_POOL_PICK_PER_DOCTRINE).map((t) => t.id));
    }
    // 한 줄기의 곁가지 2개는 노선이 달라야 한다 — 어기면 같은 RNG 로 다시 섞는다
    let order = rng.shuffle(picked);
    for (let tries = 0; tries < 200; tries++) {
      let ok = true;
      for (let i = 0; i < 6; i++) {
        if (TWIG_DEFS[order[i * 2]].doctrine === TWIG_DEFS[order[i * 2 + 1]].doctrine) ok = false;
      }
      if (ok) break;
      order = rng.shuffle(picked);
    }
    dirOrder.forEach((dir, i) => {
      twigs[trunkId(dir, ring)] = [order[i * 2], order[i * 2 + 1]];
    });
  }
  return { dirOrder, twigs };
}

export interface WebGraph {
  nodes: Record<string, TechNode>;
  adj: Record<string, string[]>;
}

const graphCache = new Map<string, WebGraph>();

export function webGraph(layout: WebLayout): WebGraph {
  const key = layout.dirOrder.join(',') + '|' + Object.values(layout.twigs).flat().join(',');
  const cached = graphCache.get(key);
  if (cached) return cached;
  const nodes: Record<string, TechNode> = { [CORE_ID]: { id: CORE_ID, kind: 'core', ring: 0 } };
  const adj: Record<string, string[]> = { [CORE_ID]: [] };
  const link = (a: string, b: string) => {
    (adj[a] ??= []).push(b);
    (adj[b] ??= []).push(a);
  };
  const { dirOrder } = layout;
  for (const ring of [1, 2, 3] as Ring[]) {
    dirOrder.forEach((dir) => {
      const id = trunkId(dir, ring);
      nodes[id] = { id, kind: 'trunk', ring, direction: dir };
      adj[id] ??= [];
    });
  }
  for (const ring of [1, 2, 3] as Ring[]) {
    dirOrder.forEach((dir, i) => {
      const id = trunkId(dir, ring);
      if (ring === 1) link(CORE_ID, id);
      else link(trunkId(dir, ring - 1), id);
      const next = dirOrder[(i + 1) % dirOrder.length];
      link(id, trunkId(next, ring));
      for (const tw of layout.twigs[id] ?? []) {
        const nid = twigNodeId(tw);
        nodes[nid] = { id: nid, kind: 'twig', ring, direction: dir, twig: TWIG_DEFS[tw], parent: id };
        link(id, nid);
      }
    });
  }
  const graph = { nodes, adj };
  if (graphCache.size > 64) graphCache.clear();
  graphCache.set(key, graph);
  return graph;
}

export function researchedCount(p: PlayerState): number {
  return p.researched.filter((id) => id !== CORE_ID).length;
}

/** 현재 연구할 수 있는 최고 고리 */
export function ringLimit(state: GameState, p: PlayerState, kind: 'trunk' | 'twig'): number {
  const base = Math.min(state.era, 3);
  return kind === 'trunk' && p.charters.explore >= 3 ? Math.min(3, base + 1) : base;
}

export function researchCost(state: GameState, p: PlayerState, nodeId: string, mods: { researchDiscount: number; trunkDiscount: number }): number {
  const { nodes, adj } = webGraph(state.layout);
  const node = nodes[nodeId];
  const base = node.kind === 'trunk' ? TRUNK_BASE_COST[node.ring] : TWIG_BASE_COST[node.ring];
  let cost = base + Math.floor(researchedCount(p) / RESEARCH_STEP);
  const touching = (adj[nodeId] ?? []).filter((n) => p.researched.includes(n)).length;
  if (touching >= 2) cost -= 1;
  if (node.kind === 'trunk') cost -= mods.trunkDiscount;
  cost -= mods.researchDiscount;
  return Math.max(1, cost);
}

/** 연구 불가 사유. 가능하면 null */
export function researchBlock(state: GameState, p: PlayerState, nodeId: string): string | null {
  const { nodes, adj } = webGraph(state.layout);
  const node = nodes[nodeId];
  if (!node || node.kind === 'core') return '없는 노드';
  if (p.researched.includes(nodeId)) return '이미 연구함';
  if (node.ring > ringLimit(state, p, node.kind)) return '아직 연구할 수 없는 고리';
  if (!(adj[nodeId] ?? []).some((n) => p.researched.includes(n))) return '연결된 연구 노드 없음';
  return null;
}

export function trunksAt(p: PlayerState, ring: number): number {
  return p.researched.filter((id) => id.startsWith('t:') && id.endsWith(`:${ring}`)).length;
}

export function hasTrunk(p: PlayerState, dir: Direction, ring: number): boolean {
  return p.researched.includes(trunkId(dir, ring));
}

export function trunksInDirection(p: PlayerState, dir: Direction): number {
  return [1, 2, 3].filter((r) => hasTrunk(p, dir, r)).length;
}
