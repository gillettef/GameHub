// 기록 문장과 결과 문장(화면 부품이 아닌 함수)
import type { ReactNode } from 'react'
import type { View } from '../def'
import { STAY, type LogEntry } from '../engine/engine'
import type { Pid } from '../engine/map'

export const cardLabel = (c: string) => (c === STAY ? '머무름' : c)

/** 엔진 기록 한 줄. 보여 줄 것이 없으면 null */
export function logText(e: LogEntry, me: Pid | null, side: Pid, names: Record<Pid, string>): ReactNode {
  // 보는 사람(side) 기준 색과 이름
  const who = (pid: Pid) => <b className={pid === side ? 'lc-me' : 'lc-opp'}>{names[pid]}</b>
  const other = (pid: Pid): Pid => (pid === 'A' ? 'B' : 'A')
  switch (e.type) {
    case 'reveal':
      return e.pid === me ? null : (
        <>
          {who(e.pid)} 함대 {e.fid} 잔상 → {e.echo}
          {e.card === STAY ? ' (머무름)' : ''}
        </>
      )
    case 'strike':
      return (
        <>
          {who(e.pid)} 함대 {e.fid} 공격 @{e.system}
        </>
      )
    case 'miss':
      return (
        <>
          빗나감 — 성계 {e.system}에 {who(other(e.pid))} 실체 없음
        </>
      )
    case 'engagement': {
      const res = e.losers.length === 0 ? '쌍방 공격 동률, 귀환 없음' : `${e.losers.map((l) => names[l]).join('·')} 패배·귀환`
      return (
        <>
          교전 @{e.system}: {who(side)} [{e.fleets[side].join(',')}] {e.sum[side]} 대 {who(other(side))} [{e.fleets[other(side)].join(',')}]{' '}
          {e.sum[other(side)]} → {res}
        </>
      )
    }
    case 'recall':
      return (
        <>
          {who(e.pid)} 함대 {e.fid} 귀환 (컨베이어 {e.cards.map(cardLabel).join(', ')})
        </>
      )
    case 'arrival':
      return (
        <>
          {who(e.pid)} 파문 도달: {e.card.kind === 'planet' ? `행성 ${e.card.planet} (${e.card.round}R 점령)` : '위장'}
        </>
      )
    case 'blockade':
      return (
        <>
          {who(e.pid)}가 행성 {e.planet} 도달을 <b className="lc-planet">봉쇄</b>
        </>
      )
    case 'hold':
      return (
        <>
          {who(e.pid)} 행성 {e.planet} <b className="lc-planet">확정 점령</b>
          {e.prev && e.prev !== e.pid ? ' (덮어씀)' : ''}
        </>
      )
    case 'neutral':
      return <>행성 {e.planet} 동시 도달 → 중립</>
    case 'place':
      if (e.pid === me && e.secret) {
        return e.secret.kind === 'planet' ? (
          <>
            {who(e.pid)} 행성 {e.secret.planet} 카드 → {e.slot}번 칸
          </>
        ) : (
          <>
            {who(e.pid)} 위장 카드 → {e.slot}번 칸
          </>
        )
      }
      return <>{who(e.pid)}가 파문 {e.slot}번 칸에 카드를 놓음</>
    case 'lastlight':
      return <b>마지막 빛 — 파문 1·2·3번 칸 처리</b>
    case 'gameover':
      return (
        <b>
          게임 종료 — {names[side]} {e.holds[side]} : {names[other(side)]} {e.holds[other(side)]}
        </b>
      )
    default:
      return null
  }
}

export function resultText(v: View, side: Pid, names: Record<Pid, string>): string {
  const how = v.lastLight ? '마지막 빛까지 간 끝에' : '즉시 승리 조건으로'
  const opp: Pid = side === 'A' ? 'B' : 'A'
  const res = v.winner === 'draw' ? '무승부' : v.me === null ? `${names[v.winner!]} 승리` : v.winner === v.me ? '승리' : '패배'
  return `${res} — ${how} 확정 점령 ${v.holdCount[side]} : ${v.holdCount[opp]}`
}

