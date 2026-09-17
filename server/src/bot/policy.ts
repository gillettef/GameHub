import type { GameAction } from '../engine/actions';
import { activeSide, cards } from '../engine/cards';
import { buildLineup, eligiblePlayers } from '../engine/lineup';
import type { Rng } from '../engine/rng';
import { INFRASTRUCTURE_COST, INFRASTRUCTURE_MAX, RESOURCES } from '../engine/types';
import type { InfrastructureType, Resource } from '../engine/types';
import type { GameView, PlayerPublicView } from '../engine/view';

// 사람과 같은 GameView 만 보고 판단하는 단순 휴리스틱 봇.
// `failed` 에는 이번 차례에 서버가 거부한 액션 종류가 들어온다 (같은 시도를 반복하지 않도록)

const UPKEEP_BUFFER = 3;
const ROSTER_TARGET = 7;
const STAFF_TARGET = 4;
const INFRA_ORDER: InfrastructureType[] = ['stand3', 'shop', 'trainingGround', 'stand4', 'lights', 'execOffice', 'billboard3'];

function affordable(me: PlayerPublicView, cost: Partial<Record<Resource, number>>, extraOps = 0): boolean {
  return RESOURCES.every((r) => (cost[r] ?? 0) + (r === 'ops' ? extraOps : 0) <= me.resources[r]);
}

// 비용을 낼 수 있고 소진/출장정지가 아닌 첫 직원 카드 행동
function usableStaffAction(me: PlayerPublicView, extraOps = 0): number {
  return me.staff.findIndex((s) => {
    const action = cards.staff(s.cardId).action;
    return action && !s.exhausted && s.suspension === 0 && affordable(me, action.cost, extraOps);
  });
}

function weekdayAction(view: GameView, me: PlayerPublicView, rng: Rng, failed: Set<string>): GameAction {
  if (view.phase.kind !== 'weekday') throw new Error('not weekday');
  const { basicDone, paidDone } = view.phase;
  const spare = me.resources.money - UPKEEP_BUFFER;
  const can = (type: string) => !failed.has(type);

  if (!basicDone) {
    const options: GameAction[] = [];
    if (can('cardAction')) {
      const idx = usableStaffAction(me);
      if (idx >= 0 && me.roster.some((r) => !r.trained)) options.push({ type: 'cardAction', source: { kind: 'staff', index: idx } });
    }
    if (can('hireStaff') && me.staff.length < STAFF_TARGET) {
      for (let i = 4; i >= 2; i--) {
        const id = view.market.staff[i];
        if (id && cards.staff(id).cost <= spare) {
          options.push({ type: 'hireStaff', marketIndex: i });
          break;
        }
      }
    }
    if (can('recruitPlayer') && me.roster.length < ROSTER_TARGET) {
      let best: { i: number; score: number } | null = null;
      for (let i = 2; i <= 4; i++) {
        const id = view.market.players[i];
        if (!id) continue;
        const side = cards.player(id).untrained;
        if (side.cost > spare) continue;
        const score = side.skill * 2 - side.cost + (side.goalkeeper && !me.roster.some((r) => activeSide(r).goalkeeper) ? 3 : 0);
        if (!best || score > best.score) best = { i, score };
      }
      if (best) options.push({ type: 'recruitPlayer', marketIndex: best.i });
    }
    if (can('buildInfrastructure') && me.infrastructure.length < INFRASTRUCTURE_MAX && INFRASTRUCTURE_COST <= spare) {
      const type = INFRA_ORDER.find((t) => {
        const def = cards.boardData.infrastructure.find((i) => i.type === t)!;
        return !(def.unique && me.infrastructure.includes(t));
      });
      if (type) options.push({ type: 'buildInfrastructure', infrastructure: type });
    }
    if (can('signSponsor') && view.market.sponsors[4]) {
      options.push({ type: 'signSponsor', marketIndex: 4, contract: me.sponsors.billboards.length < 2 ? 'billboard' : 'kit' });
    }
    if (can('buildOffice') && view.week >= 4) {
      const step = cards.boardData.office[me.office];
      if (step && step.cost > 0 && step.cost <= spare) options.push({ type: 'buildOffice' });
    }
    if (can('recruitProspect') && me.roster.length < ROSTER_TARGET && 2 <= spare && rng.float() < 0.3) options.push({ type: 'recruitProspect' });
    // 우선순위 상위 2개 중 하나를 고른다. 없으면 패스
    return options[rng.int(Math.min(options.length, 2))] ?? { type: 'pass' };
  }

  if (!paidDone && can('paidCardAction')) {
    const idx = usableStaffAction(me, 2);
    if (idx >= 0 && me.roster.some((r) => !r.trained)) return { type: 'cardAction', source: { kind: 'staff', index: idx }, paid: true };
  }
  return { type: 'endTurn' };
}

export function decide(view: GameView, rng: Rng, failed: Set<string>): GameAction | null {
  const me = view.players[view.me];
  if (!me) return null;
  const pending = me.pending[0];
  if (pending && !failed.has('resolvePending')) {
    return { type: 'resolvePending', pendingId: pending.id, instanceId: pending.candidates[rng.int(pending.candidates.length)]! };
  }

  const phase = view.phase;
  switch (phase.kind) {
    case 'setup.draft': {
      if (phase.picked[view.me] || phase.hand.length === 0) return null;
      // 돈 트랙을 올려주는 임원 선호
      const ranked = [...phase.hand].sort((a, b) => (cards.executive(b).trackAdjust.money ?? 0) - (cards.executive(a).trackAdjust.money ?? 0));
      return { type: 'draftPick', cardId: ranked[0]! };
    }
    case 'setup.objective':
      return phase.chosen[view.me] || phase.options.length === 0 ? null : { type: 'chooseObjective', cardId: phase.options[0]! };
    case 'monday.board': {
      const m = phase.meetings[view.me];
      if (phase.current !== view.me || !m || m.decided) return null;
      return m.roll === null ? { type: 'rollBoardDie' } : { type: 'acceptBoardRoll' };
    }
    case 'weekday':
      return phase.current === view.me ? weekdayAction(view, me, rng, failed) : null;
    case 'friday.prepare': {
      if (phase.current !== view.me || phase.submitted[view.me]) return null;
      const tacticCardId = view.self.tacticCards[0];
      if (!tacticCardId) return null;
      const formation = cards.tactic(tacticCardId).formations[0]!;
      const players = eligiblePlayers(me, me.resources.stamina);
      const lineup = buildLineup(me, tacticCardId, formation, players);
      if (!lineup) return null;
      const stands = Math.min(me.resources.fandom, 2 + me.infrastructure.filter((i) => i === 'stand3' || i === 'stand4').length);
      return { type: 'submitLineup', submission: { ...lineup, fandomInStands: stands } };
    }
    case 'friday.aftermath': {
      const m = phase.matches[view.me];
      if (phase.current !== view.me || !m || m.decided) return null;
      return m.roll === null ? { type: 'rollMatchDie' } : { type: 'acceptMatchRoll' };
    }
    case 'gameOver':
      return null;
  }
}
