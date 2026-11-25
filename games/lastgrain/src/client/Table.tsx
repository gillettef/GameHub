// 대국 화면. 배치(docs/refactor-plan.md 5절): ① 차례·대모래시계 ② 두 플레이어 ③ 상대 비축·보드·내 비축 ⑤ 차례 마치기
// 모래는 실시간으로 흐른다. 판정은 진행 쪽(서버·Match) 시계로 하고, 화면은 받은 뒤 흐른 시간만큼 줄여 보여 준다(표시용 예측).
import type { LogEntry, RoomSnapshot } from '@gamehub/net'
import { Button, GameShell, LogList, PlayerStrip, Sheet } from '@gamehub/ui'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Act, View } from '../def'
import {
  KINDS,
  PLAYER_NAME,
  attackOptions,
  canSummon,
  cellName,
  homeCells,
  isRuin,
  isSpring,
  moveOptions,
  reserve,
  summonable,
  unitAt,
  type Unit,
} from '../engine/rules'
import { fmtClock, fmtSec } from './format'
import { Piece } from './Piece'

export interface LocalControls {
  paused: boolean
  setPaused(paused: boolean): void
  again(): void
}

export interface TableProps {
  room: RoomSnapshot<View>
  error: string | null
  onAct(a: Act): void
  onLeave(): void
  showSec: boolean
  local?: LocalControls
}

// ---------------------------------------------------------------- 표시용 시계
const listeners = new Set<() => void>()
let nowValue = performance.now()
let ticker: ReturnType<typeof setInterval> | null = null
const clockStore = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    ticker ??= setInterval(() => {
      nowValue = performance.now()
      for (const l of listeners) l()
    }, 100)
    return () => {
      listeners.delete(fn)
      if (listeners.size === 0 && ticker) {
        clearInterval(ticker)
        ticker = null
      }
    }
  },
  get: () => nowValue,
}
/** 상태를 처음 받은 시각(같은 상태 객체면 같은 시각) */
const receivedAt = new WeakMap<object, number>()
function stamp(v: object): number {
  let t = receivedAt.get(v)
  if (t === undefined) {
    t = nowValue
    receivedAt.set(v, t)
  }
  return t
}

/** 받은 뒤 elapsed 만큼 흐른 모습. 카운트다운을 먼저 쓰고, 남은 시간만큼 대모래시계와 활성 플레이어의 모래를 줄인다 */
function predict(v: View, elapsed: number): View {
  if (v.game.over || elapsed <= 0) return v
  const countdown = Math.max(0, v.countdown - elapsed)
  const flow = Math.min(5000, elapsed - (v.countdown - countdown))
  if (flow <= 0) return { ...v, countdown }
  const g = v.game
  const units: Record<string, Unit> = {}
  for (const [id, u] of Object.entries(g.units)) units[id] = u.pos && u.owner === g.active ? { ...u, rem: Math.max(0, u.rem - flow) } : u
  return { countdown, game: { ...g, greatRem: Math.max(0, g.greatRem - flow), units } }
}

const SPRING = (
  <svg className="terrain" viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="50" cy="50" rx="46" ry="38" fill="#79bfdc" stroke="#3f8fb3" strokeWidth="4" />
    <path d="M26 52 q12 -9 24 0 t24 0" fill="none" stroke="#e8f6fb" strokeWidth="5" />
  </svg>
)
const RUIN = (
  <svg className="terrain" viewBox="0 0 100 100" aria-hidden="true">
    <g fill="none" stroke="#8a6a44" strokeWidth="6" strokeLinejoin="round" opacity=".7">
      <path d="M10 88 H90 M18 88 V40 M40 88 V40 M60 88 V40 M82 88 V40 M8 40 H92 L50 10 Z" />
    </g>
  </svg>
)

type Choice = { title: string; desc: string; items: { label: string; sub?: string; danger?: boolean; disabled?: boolean; run(): void }[] }

export function Table({ room, error, onAct, onLeave, showSec, local }: TableProps) {
  const now = useSyncExternalStore(clockStore.subscribe, clockStore.get)
  const raw = room.view!
  const running = room.status === 'playing' && !local?.paused
  const v = running ? predict(raw, now - stamp(raw)) : raw
  const s = v.game
  const me = room.you ?? 0
  const opp = 1 - me
  const watching = room.you === null
  const name = (p: number) => (watching ? (room.seats[p]?.name ?? PLAYER_NAME[p]!) : p === me ? '나' : (room.seats[p]?.name ?? '상대'))
  const mine = room.status === 'playing' && !watching && room.actors.includes(me) && !local?.paused && v.countdown <= 0

  // 고른 모래병·소환할 모래병은 그 차례 안에서만
  const [pick, setPick] = useState<{ turn: number; unit: string | null; summon: string | null }>({ turn: s.turn, unit: null, summon: null })
  const cur = pick.turn === s.turn && mine ? pick : { turn: s.turn, unit: null, summon: null }
  const selected = cur.unit && s.units[cur.unit]?.pos ? s.units[cur.unit]! : null
  const summonPick = cur.summon && canSummon(s) ? cur.summon : null
  const setSel = (unit: string | null, summon: string | null = null) => setPick({ turn: s.turn, unit, summon })

  const [menu, setMenu] = useState(false)
  const [resign, setResign] = useState(false)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [autoShown, setAutoShown] = useState(false)
  useEffect(() => {
    if (!s.over || autoShown) return
    const id = setTimeout(() => {
      setResultOpen(true)
      setAutoShown(true)
    }, 600)
    return () => clearTimeout(id)
  }, [s.over, autoShown])

  const act = (a: Act) => {
    setSel(null)
    setChoice(null)
    onAct(a)
  }
  const moves = selected ? moveOptions(s, selected.id) : []
  const attacks = selected ? attackOptions(s, selected.id) : []
  const summonCells = mine && summonPick ? homeCells(s) : []

  function onCell(c: number, r: number) {
    if (!mine) return
    const u = unitAt(s, c, r)
    if (summonPick && summonCells.some(([hc, hr]) => hc === c && hr === r)) return act({ type: 'summon', unitId: summonPick, c, r })
    if (selected) {
      const mv = moves.find((m) => m.c === c && m.r === r)
      if (mv) {
        if (!mv.canFlip) return act({ type: 'move', unitId: selected.id, c, r, flip: false })
        return setChoice({
          title: `${cellName(c, r)} 샘에 도착`,
          desc: '샘에서 모래시계를 뒤집을 수 있다.',
          items: [
            { label: '↻ 뒤집고 이동', sub: `잔량 ${fmtSec(selected.rem)}초 → ${fmtSec(selected.cap - selected.rem)}초`, run: () => act({ type: 'move', unitId: selected.id, c, r, flip: true }) },
            { label: '그대로 이동', sub: `잔량 ${fmtSec(selected.rem)}초 유지`, run: () => act({ type: 'move', unitId: selected.id, c, r, flip: false }) },
          ],
        })
      }
      const at = u && attacks.find((a) => a.targetId === u.id)
      if (u && at) {
        return setChoice({
          title: `${KINDS[u.kind].name} 공격`,
          desc: `${cellName(...u.pos!)}의 ${name(u.owner)} ${KINDS[u.kind].name}`,
          items: [
            { label: '↻ 강제 뒤집기', sub: `잔량 ${fmtSec(u.rem)}초 → ${fmtSec(u.cap - u.rem)}초`, run: () => act({ type: 'attack', unitId: selected.id, targetId: u.id, mode: 'flip' }) },
            {
              label: at.pushOff ? '⇥ 밀어내기 — 보드 밖으로' : '⇥ 밀어내기',
              sub: at.pushOff ? '사막 밖으로 흩어져 소멸한다' : at.canPush ? `${cellName(...at.pushTo!)}로 밀려난다` : '뒤 칸이 막혀 밀 수 없다',
              danger: at.pushOff,
              disabled: !at.canPush,
              run: () => act({ type: 'attack', unitId: selected.id, targetId: u.id, mode: 'push' }),
            },
          ],
        })
      }
    }
    if (u && u.owner === me && !u.acted) return setSel(u.id === selected?.id ? null : u.id)
    setSel(null)
  }

  // 내 소환 줄이 늘 아래에 오도록 돌린다
  const rows = me === 0 ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4]
  const cols = me === 0 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0]
  const playing = room.status === 'playing' && v.countdown <= 0

  const status = s.over
    ? '게임 종료'
    : v.countdown > 0
      ? '곧 시작한다'
      : local?.paused
        ? '일시정지 — 모든 모래가 멈췄다'
        : mine && s.mustSummon
          ? '보드가 비었다 · 비축에서 골라 소환하라'
          : s.active === me && !watching
            ? `${s.finalTurn ? '마지막 차례! ' : ''}내 차례 — 내 모래가 흐른다`
            : `${s.finalTurn ? '마지막 차례… ' : ''}${name(s.active)} 차례${room.seats[s.active]?.online === false ? ' · 연결 끊김' : ''}`

  const tray = (p: number, big: boolean) => {
    const list = reserve(s, p)
    const usable = mine && p === me && canSummon(s) ? summonable(s) : []
    if (list.length === 0) return <span className="text-sm text-muted">{p === me ? '모두 보드 위에 있다' : '없음'}</span>
    return list.map((u) => {
      const piece = <Piece unit={{ ...u, rem: u.cap }} lying showSec={false} size="100%" />
      if (!big) {
        return (
          <span key={u.id} className="size-8 shrink-0">
            {piece}
          </span>
        )
      }
      const ok = usable.includes(u)
      const locked = s.crumbled.includes(u.id) && s.active === me
      return (
        <button
          key={u.id}
          type="button"
          aria-label={`${KINDS[u.kind].name} 소환${ok ? '' : ' (지금은 못 함)'}`}
          aria-pressed={summonPick === u.id}
          disabled={!ok}
          className={`size-12 shrink-0 rounded-full ${summonPick === u.id ? 'ring-4 ring-[var(--lg-ok)]' : ok ? 'ring-2 ring-white/60' : ''} ${locked ? 'opacity-35' : ''}`}
          onClick={() => setSel(null, summonPick === u.id ? null : u.id)}
        >
          {piece}
        </button>
      )
    })
  }

  const logEntries: LogEntry[] = room.log.map((l) =>
    l.kind === 'p0' || l.kind === 'p1' ? { ...l, text: `[${name(Number(l.kind[1]))}] ${l.text}` } : l,
  )
  const why = s.over
    ? {
        score: `${name(s.winner!)} 쪽이 ${s.config.target}점에 먼저 도달했다.`,
        time: '대모래시계가 다 떨어져 마지막 점수 계산으로 승부가 났다.',
        resign: `${name(1 - s.winner!)} 쪽이 기권했다.`,
      }[s.endReason!]
    : ''

  let actions: ReactNode
  if (s.over) {
    actions = (
      <>
        <Button tone="primary" onClick={() => setResultOpen(true)}>
          결과 보기
        </Button>
        <Button onClick={onLeave}>처음으로</Button>
      </>
    )
  } else if (watching) {
    actions = <p className="m-0 flex items-center justify-center text-muted">관전 중</p>
  } else {
    actions = (
      <Button tone="primary" className="text-[17px]" disabled={!mine || (s.mustSummon && canSummon(s))} onClick={() => act({ type: 'end' })}>
        차례 마치기
      </Button>
    )
  }

  return (
    <>
      <GameShell
        status={status}
        detail={
          <span className="tabular-nums">
            ⌛ 대모래시계 {fmtClock(s.greatRem)} · 목표 {s.config.target}점
          </span>
        }
        onMenu={() => setMenu(true)}
        notice={error}
        players={
          <PlayerStrip
            players={[me, opp].map((p) => ({
              id: p,
              name: name(p),
              color: p === 0 ? 'var(--lg-blue)' : 'var(--lg-red)',
              score: (
                <>
                  {s.scores[p]}
                  <small className="text-xs font-semibold text-muted"> /{s.config.target}</small>
                </>
              ),
              detail: p === 0 ? '선' : '후',
              active: !s.over && s.active === p,
              you: !watching && p === me && room.code !== null,
              offline: room.seats[p]?.online === false,
            }))}
          />
        }
        actions={actions}
      >
        <div className="flex h-full flex-col gap-2 px-3 py-2">
          <div className="flex min-h-9 shrink-0 items-center gap-1.5 overflow-x-auto" aria-label={`${name(opp)} 비축`}>
            <span className="mr-1 shrink-0 text-xs text-muted">{name(opp)} 비축</span>
            {tray(opp, false)}
          </div>
          <div className="lg-board-wrap relative flex min-h-0 flex-1 items-center justify-center" data-compact>
            <div className="lg-board">
              {rows.flatMap((r) =>
                cols.map((c) => {
                  const u = unitAt(s, c, r)
                  const mv = moves.find((m) => m.c === c && m.r === r)
                  const cls = ['lg-cell']
                  if (r === 0) cls.push('home0')
                  if (r === 4) cls.push('home1')
                  if (mv) cls.push('target', mv.canFlip ? 'flip' : '')
                  if (summonCells.some(([sc, sr]) => sc === c && sr === r)) cls.push('summon-target')
                  if (u && attacks.some((a) => a.targetId === u.id)) cls.push('attackable')
                  const label = `${cellName(c, r)}${isSpring(c, r) ? ' 샘' : isRuin(c, r) ? ' 유적' : ''}${u ? `, ${name(u.owner)} ${KINDS[u.kind].name} ${fmtSec(u.rem)}초` : ''}${mv ? ', 이동할 수 있음' : ''}`
                  return (
                    <button key={`${c}-${r}`} type="button" className={cls.join(' ')} aria-label={label} onClick={() => onCell(c, r)}>
                      <span className="coord">{cellName(c, r)}</span>
                      {isSpring(c, r) ? SPRING : isRuin(c, r) ? RUIN : null}
                      {u && (
                        <Piece
                          unit={u}
                          lying={u.owner !== s.active || s.over || !playing}
                          showSec={showSec}
                          acted={u.owner === s.active && u.acted}
                          selected={u.id === selected?.id}
                        />
                      )}
                    </button>
                  )
                }),
              )}
            </div>
            {v.countdown > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="polite">
                <span className="lg-count">{Math.ceil(v.countdown / 1000)}</span>
              </div>
            )}
          </div>
          <div className="flex min-h-12 shrink-0 items-center gap-2 overflow-x-auto" aria-label="내 비축 (눌러서 소환)">
            {!watching && (
              <>
                <span className="mr-1 shrink-0 text-xs text-muted">내 비축</span>
                {tray(me, true)}
              </>
            )}
          </div>
        </div>
      </GameShell>

      <Sheet open={choice !== null} title={choice?.title ?? ''} onClose={() => setChoice(null)}>
        {choice && (
          <div className="flex flex-col gap-2 pb-2">
            <p className="m-0 text-muted">{choice.desc}</p>
            {choice.items.map((it) => (
              <Button key={it.label} tone={it.danger ? 'danger' : 'secondary'} disabled={it.disabled} className="flex flex-col py-2" onClick={it.run}>
                <span>{it.label}</span>
                {it.sub && <small className="font-normal text-muted">{it.sub}</small>}
              </Button>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet
        open={menu}
        title="메뉴"
        onClose={() => {
          setMenu(false)
          setResign(false)
        }}
      >
        <div className="flex flex-col gap-2 pb-2">
          {local && !s.over && (
            <Button onClick={() => local.setPaused(!local.paused)}>{local.paused ? '▶ 계속' : '❚❚ 일시정지'}</Button>
          )}
          {mine &&
            !s.over &&
            (resign ? (
              <Button
                tone="danger"
                onClick={() => {
                  setResign(false)
                  setMenu(false)
                  act({ type: 'resign' })
                }}
              >
                정말 기권한다 · 바로 진다
              </Button>
            ) : (
              <Button tone="danger" onClick={() => setResign(true)}>
                🏳 기권 (내 차례에만)
              </Button>
            ))}
          <a className="inline-flex min-h-12 items-center justify-center rounded-xl bg-raised font-semibold text-text no-underline" href="rules.html" target="_blank" rel="noopener">
            📖 규칙서
          </a>
          <h3 className="mt-2 mb-0 text-sm text-muted">기록</h3>
          <LogList entries={logEntries} />
          <Button onClick={onLeave}>{local ? '⌂ 처음으로 · 이 게임은 끝난다' : '⌂ 나가기 · 자리는 봇이 이어받는다'}</Button>
        </div>
      </Sheet>

      <Sheet open={resultOpen} title="결과" onClose={() => setResultOpen(false)}>
        {s.over && (
          <div className="flex flex-col gap-2 pb-2">
            <p className="m-0 text-3xl font-extrabold">{watching ? `${name(s.winner!)} 승리` : s.winner === me ? '승리!' : '패배'}</p>
            <p className="m-0">{why}</p>
            <p className="m-0">
              최종 점수 — {name(me)} <b>{s.scores[me]}</b> : {name(opp)} <b>{s.scores[opp]}</b>
              <br />총 {s.turn}차례 · 대모래시계 {fmtClock(s.config.greatMs - s.greatRem)} 경과
            </p>
            {local && (
              <Button tone="primary" onClick={local.again}>
                다시 하기
              </Button>
            )}
            <Button onClick={onLeave}>처음으로</Button>
          </div>
        )}
      </Sheet>
    </>
  )
}
