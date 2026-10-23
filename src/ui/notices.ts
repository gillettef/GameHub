/**
 * 플레이어가 하나씩 확인하고 넘어가야 할 알림 (라운드 시작, 목표 달성, 평면 점수 확정, 잔해).
 * 연출 사건(FxEvent)을 모달 한 장씩으로 묶는다. 엔진 상태를 읽기만 한다.
 */
import type { GameState, RoundGoalId } from '../engine'
import type { FxEvent } from './fx'

export type Notice =
  | {
      kind: 'round'
      round: 1 | 2 | 3 | 4
      /** 이번 라운드에 공개된 목표 카드 */
      goals: RoundGoalId[]
      /** 1라운드: 시작 플레이어 */
      startPlayer: number | null
      /** 4라운드: 플레이어별 넘길 ⧗ 주사위 수 */
      pending: number[] | null
    }
  | { kind: 'goal'; items: { player: number; name: string; points: number; first: boolean }[] }
  | { kind: 'plane'; items: { player: number; points: number }[] }
  | { kind: 'debris'; items: { player: number; count: number }[] }

/**
 * 사건 목록 → 확인할 알림 목록.
 * 직전 라운드의 결과(평면 점수, 목표, 잔해)를 먼저 보이고 새 라운드 안내를 마지막에 둔다.
 * quietDebris: 이 플레이어의 잔해는 알리지 않는다 (스스로 버리기를 두 번 눌러 확인한 경우)
 */
export function buildNotices(events: FxEvent[], state: GameState, quietDebris: (player: number) => boolean = () => false): Notice[] {
  const out: Notice[] = []

  const plane = events.flatMap((e) => (e.kind === 'plane' ? [{ player: e.player, points: e.points }] : []))
  if (plane.length > 0) out.push({ kind: 'plane', items: plane })

  const goals = events.flatMap((e) => (e.kind === 'goal' ? [{ player: e.player, name: e.name, points: e.points, first: e.first }] : []))
  if (goals.length > 0) out.push({ kind: 'goal', items: goals })

  const debris = events.flatMap((e) => (e.kind === 'debris' && !quietDebris(e.player) ? [{ player: e.player, count: e.count }] : []))
  if (debris.length > 0) out.push({ kind: 'debris', items: debris })

  for (const e of events) {
    if (e.kind !== 'round') continue
    out.push({
      kind: 'round',
      round: e.round,
      goals: state.roundGoals.filter((g) => g.round === e.round).map((g) => g.id),
      startPlayer: e.round === 1 ? state.startPlayer : null,
      pending: e.round === 4 && state.time ? state.time.pending.map((ids) => ids.length) : null,
    })
  }
  return out
}
