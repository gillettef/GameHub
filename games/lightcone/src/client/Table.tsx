// 대국 화면. 배치(docs/refactor-plan.md 5절):
// ① 단계·라운드·할 일 ② 두 진영(확정 점령 수, 제출 여부) ③ 성계 지도 ④ 내 함대·단계별 선택·파문 컨베이어 ⑤ 확정 버튼
import type { RoomSnapshot } from '@gamehub/net'
import { BoardViewport, Button, GameShell, LogList, PlayerStrip, ResultList, Sheet } from '@gamehub/ui'
import { useEffect, useState, type ReactNode } from 'react'
import { PHASE_NAME, pidOf, seatOf, type Action, type View } from '../def'
import { STAY } from '../engine/engine'
import { ROUNDS, VICTORY, type Pid } from '../engine/map'
import { Board } from './Board'
import { Hand } from './Hand'
import { resultText } from './log'
import { freshPicks, type Picks } from './picks'
import { GameLog, Legend, RulesText } from './text'

/** 한 기기 대전에서만 */
export interface LocalControls {
  /** 봇끼리 두는 판(관전) 조작 */
  paused: boolean
  speed: number
  setPaused(paused: boolean): void
  setSpeed(speed: number): void
  again(): void
  /** 봇 실체 보기(봇이 있을 때만) */
  peek: boolean | null
  setPeek(on: boolean): void
  revealed: Record<Pid, string[]> | null
}

export interface TableProps {
  room: RoomSnapshot<View>
  error: string | null
  onAct(a: Action): void
  onLeave(): void
  local?: LocalControls
}

const SPEEDS = [1, 2, 4] as const

const SHORT_HINT: Partial<Record<View['phase'], string>> = {
  plan: '함대를 고르고 빛나는 성계를 누르세요',
  attack: '공격할 함대를 고르세요',
  blockade: '도달하는 상대 점령을 봉쇄할 수 있어요',
  occupy: '행성 위 함대로 점령하거나 위장하세요',
}

function longHint(v: View, opp: string): string | null {
  switch (v.phase) {
    case 'plan':
      return '함대를 고른 뒤 지도에서 빛나는 성계를 누르세요. 직전에 떠난 성계로는 갈 수 없습니다(관성).'
    case 'attack':
      return `그 성계에 ${opp} 실체가 있으면 교전합니다. 공격한 함대는 이번 라운드에 점령·위장·봉쇄할 수 없고, 빗나가면 위치만 드러납니다.`
    case 'blockade':
      return `${opp}의 점령 카드가 내 함대가 있는 행성에 도달했습니다. 봉쇄하면 무효가 되지만 내 함대 위치가 드러납니다.`
    case 'occupy':
      return `위장 카드(남은 ${v.mine?.decoys ?? 0}장)는 ${opp}를 속입니다. 나중에 도달한 점령이 덮어씁니다.`
    default:
      return null
  }
}

export function Table({ room, error, onAct, onLeave, local }: TableProps) {
  const v = room.view!
  const me = v.me
  const side: Pid = me ?? 'A'
  const opp: Pid = side === 'A' ? 'B' : 'A'
  const seatName = (pid: Pid) => room.seats[seatOf(pid)]?.name ?? pid
  const names: Record<Pid, string> = { A: seatName('A'), B: seatName('B') }
  // 기록·보드 글에서는 내 쪽을 '나'로
  const talk: Record<Pid, string> = me ? { ...names, [me]: '나' } : names
  const oppName = talk[opp]

  const [menu, setMenu] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [autoShown, setAutoShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const key = `${v.round}-${v.phase}`
  const [stored, setPicks] = useState<Picks>(() => freshPicks(v, key))
  const picks = stored.key === key ? stored : freshPicks(v, key)
  const update = (change: Partial<Picks>) => setPicks({ ...picks, ...change })

  const over = v.phase === 'over'
  const choosing = room.status === 'playing' && me !== null && room.actors.includes(room.you!) && !v.submitted[me]
  const spectate = local !== undefined && room.seats.every((s) => s.kind === 'bot')
  const inProgress = !over && (local ? room.seats.some((s) => s.kind === 'human') : room.you !== null)

  useEffect(() => {
    if (!over || autoShown) return
    const id = setTimeout(() => {
      setResultOpen(true)
      setAutoShown(true)
    }, 700)
    return () => clearTimeout(id)
  }, [over, autoShown])

  const send = (a: Action) => onAct(a)

  // ---------------------------------------------------------------- 계획 단계: 지도에서 고르기
  const planning = choosing && v.phase === 'plan'
  const selFleet = v.mine?.fleets.find((f) => f.id === picks.sel)
  const targets = planning && selFleet ? selFleet.legal.filter((m) => m !== STAY) : []
  const setMove = (fid: number, m: string) => {
    const fleets = v.mine!.fleets
    const moves = picks.moves.slice()
    moves[fleets.findIndex((f) => f.id === fid)] = m
    const next = fleets.find((f, i) => f.id !== fid && moves[i] === STAY)
    update({ moves, sel: next?.id ?? picks.sel })
  }

  // ---------------------------------------------------------------- ① 상태
  let status: ReactNode
  let detail: ReactNode
  if (over) {
    status = '게임 끝'
    detail = resultText(v, side, talk)
  } else if (choosing) {
    status = PHASE_NAME[v.phase]
    detail = `${v.round}/${ROUNDS}라운드 · ${SHORT_HINT[v.phase] ?? ''}`
  } else if (me && v.submitted[me]) {
    status = '제출 완료'
    detail = `${v.round}/${ROUNDS}라운드 ${PHASE_NAME[v.phase]} · ${oppName} 고르는 중…`
  } else if (me) {
    status = `${oppName} 차례`
    detail = `${v.round}/${ROUNDS}라운드 ${PHASE_NAME[v.phase]} · 낼 것이 없습니다`
  } else {
    status = PHASE_NAME[v.phase]
    detail = `${v.round}/${ROUNDS}라운드 · 관전 중`
  }

  // ---------------------------------------------------------------- ⑤ 행동
  const waitingText = (() => {
    const waitPid = (['A', 'B'] as const).find((p) => room.actors.includes(seatOf(p)) && p !== me)
    if (!waitPid) return '처리 중…'
    const seat = room.seats[seatOf(waitPid)]
    if (seat && !seat.online) return `${talk[waitPid]} 연결 끊김 · 곧 봇이 대신합니다`
    return `${talk[waitPid]} 고르는 중…`
  })()

  let actions: ReactNode
  if (over) {
    actions = (
      <div className="flex gap-2 *:flex-1">
        <Button tone="primary" onClick={() => setResultOpen(true)}>
          결과 보기
        </Button>
        {local ? <Button onClick={local.again}>다시 하기</Button> : <Button onClick={onLeave}>처음으로</Button>}
      </div>
    )
  } else if (spectate && local) {
    actions = (
      <div className="flex items-center gap-2">
        <Button className="w-14 shrink-0" aria-label={local.paused ? '재생' : '일시정지'} onClick={() => local.setPaused(!local.paused)}>
          {local.paused ? '▶' : '❚❚'}
        </Button>
        <div className="flex flex-1 gap-1 rounded-xl bg-bg p-1" role="group" aria-label="속도">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={local.speed === s}
              className={`min-h-11 flex-1 rounded-lg text-sm ${local.speed === s ? 'bg-raised font-bold' : 'text-muted'}`}
              onClick={() => local.setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
        <Button className="shrink-0" onClick={local.again}>
          새 판
        </Button>
      </div>
    )
  } else if (!choosing) {
    actions = (
      <p className="m-0 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-bg text-muted">
        {me && <span className="lc-spin" aria-hidden="true" />}
        {me ? waitingText : `관전 중 · ${waitingText}`}
      </p>
    )
  } else if (v.phase === 'plan') {
    const allStay = picks.moves.every((m) => m === STAY)
    actions = (
      <div className="flex gap-2">
        <Button className="shrink-0" onClick={() => setMove(picks.sel, STAY)}>
          함대 {picks.sel} 머무름
        </Button>
        <Button tone="primary" className="flex-1" onClick={() => send({ type: 'moves', moves: picks.moves.slice() })}>
          {allStay ? '모두 머무름 확정' : '이동 확정'}
        </Button>
      </div>
    )
  } else if (v.phase === 'attack') {
    actions = (
      <Button tone="primary" onClick={() => send({ type: 'attacks', fleets: picks.attacks.slice().sort() })}>
        {picks.attacks.length ? `공격 ${picks.attacks.length}건 확정` : '공격하지 않음'}
      </Button>
    )
  } else if (v.phase === 'blockade') {
    actions = (
      <Button tone="primary" onClick={() => send({ type: 'blockades', idx: picks.blocks.slice() })}>
        {picks.blocks.length ? `봉쇄 ${picks.blocks.length}건 확정` : '봉쇄하지 않음'}
      </Button>
    )
  } else if (v.phase === 'occupy') {
    actions = (
      <Button
        tone="primary"
        onClick={() => {
          const orders: Extract<Action, { type: 'occupy' }>['orders'] = []
          for (const f of v.mine!.fleets) {
            const o = picks.orders[f.id] ?? 'none'
            if (!v.mine!.eligible.includes(f.id) || o === 'none') continue
            if (o === 'occupy') orders.push({ fid: f.id, kind: 'occupy' })
            else orders.push({ fid: f.id, kind: 'decoy', slot: Number(o.slice(5)) })
          }
          send({ type: 'occupy', orders })
        }}
      >
        점령 확정
      </Button>
    )
  }

  const proxies = room.log.filter((l) => l.kind === 'proxy')
  const ranked = (['A', 'B'] as const).slice().sort((a, b) => (v.winner === b ? 1 : 0) - (v.winner === a ? 1 : 0))

  return (
    <>
      <GameShell
        status={status}
        detail={detail}
        onMenu={() => setMenu(true)}
        notice={error}
        players={
          <PlayerStrip
            players={room.seats.map((s, i) => {
              const pid = pidOf(i)
              const acting = !over && room.actors.includes(i)
              return {
                id: i,
                name: s.name,
                color: pid === side ? 'var(--lc-me)' : 'var(--lc-opp)',
                score: (
                  <>
                    {v.holdCount[pid]}
                    <small className="text-xs font-semibold text-muted"> /{VICTORY}</small>
                  </>
                ),
                detail: over ? (v.winner === pid ? '승리' : v.winner === 'draw' ? '무승부' : '') : v.submitted[pid] ? '제출함' : acting ? '고르는 중' : '대기',
                active: acting,
                you: room.code !== null && i === room.you,
                offline: !s.online,
              }
            })}
          />
        }
        hand={<Hand view={v} side={side} names={talk} picks={picks} choosing={choosing} hint={choosing ? longHint(v, oppName) : null} update={update} />}
        actions={actions}
      >
        <div className="relative h-full" data-compact>
          <BoardViewport>
            <Board
              view={v}
              side={side}
              names={talk}
              moves={planning ? picks.moves : null}
              sel={planning ? picks.sel : null}
              targets={targets}
              onTarget={(s) => setMove(picks.sel, s)}
              onSelect={(fid) => update({ sel: fid })}
              revealed={local?.peek ? local.revealed : null}
            />
          </BoardViewport>
          {local?.peek && !over && (
            <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-[rgba(255,154,77,.2)] px-2.5 py-0.5 text-xs font-bold text-[var(--lc-opp)]">봇 실체 보기</span>
          )}
        </div>
      </GameShell>

      <Sheet open={menu} title="메뉴" onClose={() => setMenu(false)}>
        {local && local.peek !== null && (
          <button
            type="button"
            role="switch"
            aria-checked={local.peek}
            className="mb-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-raised px-3 text-left"
            onClick={() => local.setPeek(!local.peek)}
          >
            <span>
              봇 실체 보기
              <small className="block text-xs text-muted">봇 함대의 실제 위치를 지도에 표시합니다</small>
            </span>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${local.peek ? 'bg-primary text-on-primary' : 'bg-bg text-muted'}`}>{local.peek ? '켬' : '끔'}</span>
          </button>
        )}
        <h3 className="mt-0 mb-1 text-sm text-muted">기록</h3>
        {proxies.length > 0 && <LogList entries={proxies} />}
        <GameLog view={v} side={side} names={talk} />
        <h3 className="mt-5 mb-2 text-sm text-muted">지도 보는 법</h3>
        <Legend names={talk} side={side} />
        <h3 className="mt-5 mb-2 text-sm text-muted">규칙 한눈에</h3>
        <RulesText />
        {leaving ? (
          <div className="mt-4 rounded-xl border border-danger p-3">
            <p className="mt-0">{local ? '이 판을 그만두고 나갈까요?' : '나가면 그 자리는 봇이 이어받고 돌아올 수 없습니다.'}</p>
            <div className="flex gap-2 *:flex-1">
              <Button onClick={() => setLeaving(false)}>계속하기</Button>
              <Button tone="danger" onClick={onLeave}>
                나가기
              </Button>
            </div>
          </div>
        ) : (
          <Button tone="danger" className="mt-4 w-full" onClick={() => (inProgress ? setLeaving(true) : onLeave())}>
            나가기
          </Button>
        )}
      </Sheet>

      <Sheet open={resultOpen} title="결과" onClose={() => setResultOpen(false)}>
        <p className="mt-0 text-lg font-bold">{v.winner === 'draw' ? '무승부' : me === null ? `${names[v.winner as Pid]} 승리` : v.winner === me ? '승리!' : '패배'}</p>
        <p className="text-muted">{resultText(v, side, talk)}</p>
        <ResultList
          rows={ranked.map((pid) => ({
            id: seatOf(pid),
            name: names[pid],
            score: v.holdCount[pid],
            detail: '확정 점령',
            winner: v.winner === pid,
          }))}
        />
        <h3 className="mt-4 mb-1 text-sm text-muted">실제 경로 (함대 1·2·3)</h3>
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-2 font-normal">R</th>
              <th className="lc-me py-1 pr-2">{talk[side]}</th>
              <th className="lc-opp py-1">{talk[opp]}</th>
            </tr>
          </thead>
          <tbody>
            {v.history.map((h) => (
              <tr key={h.round} className="border-t border-line">
                <td className="py-1 pr-2 text-muted">{h.round}</td>
                <td className="py-1 pr-2">{h[side].join(' · ')}</td>
                <td className="py-1">{h[opp].join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex flex-col gap-2">
          {local && (
            <Button tone="primary" onClick={local.again}>
              다시 하기
            </Button>
          )}
          <Button onClick={() => setResultOpen(false)}>보드 보기</Button>
          <Button tone="ghost" onClick={onLeave}>
            처음으로
          </Button>
        </div>
      </Sheet>
    </>
  )
}
