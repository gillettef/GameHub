// 대국 화면. 배치(docs/refactor-plan.md 5절): ① 차례·걸음 ② 플레이어 ③ 접는 보드와 최근 기록 ⑤ 접기·펼치기·차례 끝내기
import type { RoomSnapshot } from '@gamehub/net'
import { BoardViewport, Button, GameShell, LogList, PlayerStrip, ResultList, Sheet } from '@gamehub/ui'
import { useEffect, useState } from 'react'
import { SIDE_NAME, type Action } from '../def'
import { applyFoldAction, isCoveredCol, legalFolds, legalSteps, sameFold, type FoldAction, type Side, type View } from '../engine/engine'
import { RULES, per } from '../engine/rules'
import { Board } from './Board'
import { RulesText } from './RulesText'
import { COLORS } from './seats'
import { Segmented } from './Segmented'

/** 한 기기 대전에서만: 봇 관전 조작과 다시 하기 */
export interface LocalControls {
  paused: boolean
  speed: number
  setPaused(paused: boolean): void
  setSpeed(speed: number): void
  again(): void
}

export interface TableProps {
  room: RoomSnapshot<View>
  error: string | null
  onAct(a: Action): void
  onLeave(): void
  local?: LocalControls
}

const SPEEDS = [
  [1, '1×'],
  [2, '2×'],
  [4, '4×'],
] as const

export function Table({ room, error, onAct, onLeave, local }: TableProps) {
  const v = room.view!
  const [menu, setMenu] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [autoShown, setAutoShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [pendingAt, setPendingAt] = useState<{ action: FoldAction; version: number } | null>(null)

  const target = per(RULES.target, v.n)
  const cur = v.current
  const curSeat = room.seats[cur]
  const curName = curSeat?.name ?? ''
  const mine = room.status === 'playing' && room.you !== null && room.actors.includes(room.you)
  const spectate = local !== undefined && room.seats.every((s) => s.kind === 'bot')
  const humans = room.seats.filter((s) => s.kind === 'human').length
  // 미리보기는 그 상태(version)에서만 유효하다
  const pending = mine && pendingAt?.version === room.version ? pendingAt.action : null
  const absent = isCoveredCol(v.fold, v.players[cur]!.c)
  const inProgress = !v.over && (local ? humans > 0 : room.you !== null)

  // 게임이 끝나면 잠시 뒤 결과를 한 번 띄운다
  useEffect(() => {
    if (!v.over || autoShown) return
    const id = setTimeout(() => {
      setResultOpen(true)
      setAutoShown(true)
    }, 700)
    return () => clearTimeout(id)
  }, [v.over, autoShown])

  const send = (a: Action) => {
    setPendingAt(null)
    onAct(a)
  }
  const pressFold = (a: FoldAction) => {
    if (pending && sameFold(pending, a)) send(pending)
    else setPendingAt({ action: a, version: room.version })
  }
  const onCell = (c: number, r: number) => {
    if (pending) return setPendingAt(null)
    if (mine && legalSteps(v).some(([a, b]) => a === c && b === r)) send({ type: 'step', to: [c, r] })
  }

  const status = v.over ? '게임 끝' : mine ? (humans > 1 && local ? `${curName} 차례` : '내 차례') : `${curName} 차례`
  const detail = v.over ? (
    `${(v.winners ?? []).map((i) => room.seats[i]?.name).join(', ')} 승리${(v.winners?.length ?? 0) > 1 ? ' (공동)' : ''}`
  ) : mine && absent ? (
    '부재 중 · 날개를 펼쳐야 움직일 수 있어요'
  ) : (
    <>
      {v.activeIds ? '동점 결승 · ' : ''}
      {v.round}라운드 · 목표 {target}점
      <span className="ml-2 tracking-[0.15em]" aria-label={`남은 걸음 ${v.turnMaxSteps - v.turnSteps}`}>
        {Array.from({ length: v.turnMaxSteps }, (_, i) => (i < v.turnSteps ? '○' : '●')).join('')}
      </span>
      <span className={`ml-1.5 ${v.turnFolded ? 'text-muted line-through' : 'text-primary'}`}>접기</span>
    </>
  )

  const folds = mine ? legalFolds(v) : []
  const foldRow = (side: Side) => {
    const options: FoldAction[] = [1, 2, 3].map((width) => ({ type: 'fold', side, width }))
    options.push({ type: 'unfold', side })
    return (
      <div className="grid grid-cols-[3.25rem_repeat(3,1fr)_1.3fr] items-center gap-1.5">
        <span className="text-center text-sm font-bold text-muted">{SIDE_NAME[side]}</span>
        {options.map((a) => {
          const on = pending !== null && sameFold(pending, a)
          return (
            <button
              key={a.type === 'fold' ? a.width : 'u'}
              type="button"
              aria-pressed={on}
              disabled={!folds.some((b) => sameFold(a, b))}
              className={`min-h-11 rounded-xl text-[15px] font-bold disabled:opacity-30 ${on ? 'bg-primary text-on-primary' : 'bg-raised'}`}
              onClick={() => pressFold(a)}
            >
              {a.type === 'fold' ? `${a.width}열` : '펼치기'}
            </button>
          )
        })}
      </div>
    )
  }

  const waiting =
    curSeat?.kind === 'bot'
      ? `${curName} 생각 중…`
      : curSeat && !curSeat.online
        ? `${curName}님 연결 끊김 · 곧 봇이 대신합니다`
        : room.you === null
          ? `${curName} 차례`
          : `${curName}님의 차례를 기다리는 중`

  let actions
  if (v.over) {
    actions = (
      <div className="flex gap-2 *:flex-1">
        <Button tone="primary" onClick={() => setResultOpen(true)}>
          결과 보기
        </Button>
        <Button onClick={onLeave}>처음으로</Button>
      </div>
    )
  } else if (spectate && local) {
    actions = (
      <div className="flex items-center gap-2">
        <Button className="w-14 shrink-0" aria-label={local.paused ? '재생' : '일시정지'} onClick={() => local.setPaused(!local.paused)}>
          {local.paused ? '▶' : '❚❚'}
        </Button>
        <div className="flex-1">
          <Segmented label="속도" options={SPEEDS} value={local.speed as 1 | 2 | 4} onChange={local.setSpeed} />
        </div>
        <Button className="shrink-0" onClick={local.again}>
          새 판
        </Button>
      </div>
    )
  } else {
    actions = (
      <div className="flex flex-col gap-2">
        {foldRow('L')}
        {foldRow('R')}
        {mine ? (
          <Button tone={pending ? 'secondary' : 'primary'} className="min-h-13 text-[17px]" onClick={() => (pending ? setPendingAt(null) : send({ type: 'end' }))}>
            {pending ? '미리보기 취소' : '차례 끝내기'}
          </Button>
        ) : (
          <p className="m-0 flex min-h-13 items-center justify-center rounded-xl bg-bg text-muted">{waiting}</p>
        )}
      </div>
    )
  }

  const ranked = [...v.players].sort((a, b) => b.score - a.score || b.carried - a.carried)

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
              const p = v.players[i]!
              return {
                id: i,
                name: s.name,
                color: COLORS[i]!,
                score: (
                  <>
                    {p.score}
                    <small className="text-xs font-semibold text-muted"> /{target}</small>
                  </>
                ),
                detail: <span className="tracking-[0.1em] text-primary">{'★'.repeat(p.carried) + '☆'.repeat(Math.max(0, RULES.carryLimit - p.carried))}</span>,
                active: !v.over && i === cur,
                you: room.code !== null && i === room.you,
                offline: !s.online,
              }
            })}
          />
        }
        actions={actions}
      >
        <div className="flex h-full flex-col">
          <div className="relative min-h-0 flex-1" data-compact>
            <BoardViewport>
              <Board
                view={v}
                previewFold={pending ? applyFoldAction(v.fold, pending) : null}
                legal={mine && !pending ? legalSteps(v) : []}
                focus={v.over ? null : cur}
                onCell={onCell}
              />
            </BoardViewport>
            {pending && (
              <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[13px] font-bold whitespace-nowrap text-on-primary shadow-lg">
                미리보기 · 같은 버튼을 한 번 더 눌러 확정
              </div>
            )}
          </div>
          <ol className="m-0 flex shrink-0 list-none flex-col gap-0.5 px-4 pb-2" aria-label="최근 기록">
            {room.log
              .slice(-4)
              .reverse()
              .map((l, i) => (
                <li
                  key={l.id}
                  className={`truncate text-sm ${i === 0 ? 'font-semibold text-text' : 'text-muted'} ${l.kind === 'spawn' ? 'text-[#d9c48a]' : ''}`}
                  style={{ opacity: 1 - i * 0.22 }}
                >
                  {l.text}
                </li>
              ))}
          </ol>
        </div>
      </GameShell>

      <Sheet open={menu} title="메뉴" onClose={() => setMenu(false)}>
        <h3 className="mt-0 mb-1 text-sm text-muted">기록</h3>
        <LogList entries={room.log} />
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
        <ResultList
          rows={ranked.map((p) => ({
            id: p.id,
            name: room.seats[p.id]?.name ?? '',
            score: `${p.score}점`,
            detail: p.carried ? `들고 있는 조각 ${p.carried}` : undefined,
            winner: v.winners?.includes(p.id) ?? false,
          }))}
        />
        <div className="mt-3 flex flex-col gap-2">
          {local && (
            <Button tone="primary" onClick={local.again}>
              다시 하기
            </Button>
          )}
          <Button onClick={onLeave}>처음으로</Button>
        </div>
      </Sheet>
    </>
  )
}
