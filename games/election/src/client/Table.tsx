// 대국 화면. 배치(docs/refactor-plan.md 5절):
// ① 차례·할 일 ② 두 후보(표·예비군) ③ 선거인단 바·단계 칩·보드·속보 ⑤ 내리기(유세 중)·투입 완료·결과·다시 하기
import type { RoomSnapshot } from '@gamehub/net'
import { BoardViewport, Button, GameShell, LogList, PlayerStrip, Sheet } from '@gamehub/ui'
import { useEffect, useState } from 'react'
import { colorOf, seatOf, type Action, type View } from '../def'
import { MAX_PLACE_PER_TURN, PLAYER_EMOJI, PLAYER_NAMES } from '../engine/constants'
import { countColor, isFull, score } from '../engine/rules'
import type { GameState, Player } from '../engine/types'
import { Board } from './Board'
import { Mark } from './icons'
import { usePlayback } from './playback'
import { Result, TugBar } from './Result'
import { RulesText } from './RulesText'
import { myTurnText, otherTurnText, overText, TOTAL_SEATS } from './text'
import { THEME_LABEL, type ThemePref } from './theme'

/** 한 기기 대전에서만 */
export interface LocalControls {
  /** 봇끼리 두는 판(관전)의 일시정지 */
  paused: boolean
  setPaused(paused: boolean): void
  /** 연출이 끝날 때까지 봇이 기다리게 한다 */
  hold(busy: boolean): void
  again(): void
}

export interface TableProps {
  room: RoomSnapshot<View>
  error: string | null
  onAct(a: Action): void
  onLeave(): void
  theme: ThemePref
  onTheme(t: ThemePref): void
  local?: LocalControls
}

function Steps({ s, who }: { s: GameState; who: string }) {
  if (s.phase === 'over') return null
  if (s.phase === 'setup') {
    return (
      <ol className="el-steps single" aria-label="차례 단계">
        <li className="on" aria-current="step">
          사전 배치 · {who} 남은 {s.setupLeft[s.current]}명
        </li>
      </ol>
    )
  }
  const cur = { place: 0, pick: 1, sow: 2 }[s.phase]
  const first = MAX_PLACE_PER_TURN > 1 && cur === 0 ? `① 투입 ${Math.min(s.placedThisTurn + 1, MAX_PLACE_PER_TURN)}/${MAX_PLACE_PER_TURN}` : '① 투입'
  return (
    <ol className="el-steps" aria-label="차례 단계">
      {[first, '② 출발', '③ 유세'].map((label, k) => (
        <li key={k} className={k === cur ? 'on' : k < cur ? 'done' : ''} aria-current={k === cur ? 'step' : undefined}>
          {label}
        </li>
      ))}
    </ol>
  )
}

export function Table({ room, error, onAct, onLeave, theme, onTheme, local }: TableProps) {
  const v = room.view!
  const { shown: s, busy, highlight, pulse } = usePlayback(v.game, v.last)
  const [menu, setMenu] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [autoShown, setAutoShown] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const hold = local?.hold
  useEffect(() => hold?.(busy), [hold, busy])

  const over = s.phase === 'over'
  const humans = room.seats.filter((x) => x.kind === 'human').length
  const watching = local ? humans === 0 : room.you === null
  const curSeat = seatOf(v.blue, s.current)
  const cur = room.seats[curSeat]
  // 한 기기에서는 LocalGame 이 지금 둘 사람의 자리를 you 로 준다
  const mine = !busy && !over && room.status === 'playing' && room.you !== null && room.you === curSeat && room.actors.includes(curSeat)
  const nameOf = (p: Player) => room.seats[seatOf(v.blue, p)]?.name ?? PLAYER_NAMES[p]
  const names: [string, string] = [nameOf(0), nameOf(1)]
  // 한 기기 두 사람·관전은 '나'가 없다
  const myColor: Player | null = !watching && !(local && humans > 1) && room.you !== null ? colorOf(v.blue, room.you) : null
  const inProgress = v.game.phase !== 'over' && !watching

  // 개표가 끝나고 연출도 끝나면 잠시 뒤 결과를 한 번 띄운다
  useEffect(() => {
    if (!over || busy || autoShown) return
    const id = setTimeout(() => {
      setResultOpen(true)
      setAutoShown(true)
    }, 700)
    return () => clearTimeout(id)
  }, [over, busy, autoShown])

  const selectable = (i: number) => {
    if (!mine) return false
    if (s.phase === 'setup' || s.phase === 'place') return !isFull(s, i)
    if (s.phase === 'pick') return s.holes[i]!.length > 0
    return false
  }
  const onHole = (i: number) => {
    if (s.phase === 'setup' || s.phase === 'place') onAct({ type: s.phase, hole: i })
    else if (s.phase === 'pick') onAct({ type: 'pick', hole: i })
  }

  const who = `${PLAYER_EMOJI[s.current]} ${cur?.name ?? ''}`
  let status: string
  let detail: string
  if (over) ({ title: status, detail } = busy ? { title: '개표 중…', detail: '' } : overText(s))
  else if (busy) {
    status = s.phase === 'sow' ? '유세 버스 이동 중…' : '잠시만요…'
    detail = who
  } else if (mine) {
    const t = myTurnText(s)
    status = local && humans > 1 ? `${who} 차례 · ${t.title}` : `내 차례 · ${t.title}`
    detail = t.detail
  } else if (cur?.kind === 'human' && !cur.online) {
    status = `${who} 연결 끊김`
    detail = '곧 봇이 대신 둡니다'
  } else {
    status = otherTurnText(s, who)
    detail = cur?.kind === 'bot' ? '봇이 생각하는 중' : room.you === null ? '관전 중' : '상대 차례예요. 기다리는 중…'
  }

  const t = score(s)
  const undecided = TOTAL_SEATS - t[0] - t[1]
  const lastLog = room.log.at(-1)?.text ?? '유세 시작!'

  let actions
  if (over) {
    actions = (
      <>
        <Button tone="primary" onClick={() => setResultOpen(true)}>
          결과 보기
        </Button>
        {local && <Button onClick={local.again}>다시 하기</Button>}
        <Button onClick={onLeave}>처음으로</Button>
      </>
    )
  } else if (s.phase === 'sow' && mine) {
    const blue = countColor(s.bus, 0)
    actions = ([0, 1] as const)
      .filter((c) => (c === 0 ? blue : s.bus.length - blue) > 0)
      .map((c) => {
        const n = c === 0 ? blue : s.bus.length - blue
        return (
          <button key={c} type="button" className={`el-drop d${c}`} aria-label={`${PLAYER_NAMES[c]} 지지자 내리기, ${n}명 남음`} onClick={() => onAct({ type: 'drop', color: c })}>
            <Mark p={c} />
            <span className="el-drop-text">
              <span>{PLAYER_NAMES[c]} 내리기</span>
              <small>{n}명 남음</small>
            </span>
          </button>
        )
      })
  } else if (watching && local) {
    actions = (
      <>
        <Button aria-label={local.paused ? '재생' : '일시정지'} onClick={() => local.setPaused(!local.paused)}>
          {local.paused ? '▶ 재생' : '❚❚ 일시정지'}
        </Button>
        <Button onClick={local.again}>새 판</Button>
      </>
    )
  } else if (mine && s.phase === 'place' && s.placedThisTurn >= 1) {
    actions = (
      <Button tone="primary" onClick={() => onAct({ type: 'endPlace' })}>
        투입 완료
      </Button>
    )
  } else {
    actions = <p className="el-hint">{mine ? (s.phase === 'pick' ? '지지자가 있는 권역을 누르세요' : '빛나는 권역을 누르세요') : busy ? '유세 진행 중…' : status}</p>
  }

  return (
    <>
      <GameShell
        status={status}
        detail={detail}
        onMenu={() => setMenu(true)}
        notice={error}
        players={
          <PlayerStrip
            players={([0, 1] as const).map((p) => {
              const seat = seatOf(v.blue, p)
              const info = room.seats[seat]
              return {
                id: seat,
                name: info?.name ?? PLAYER_NAMES[p],
                color: p === 0 ? 'var(--b)' : 'var(--r)',
                score: (
                  <>
                    {t[p]}
                    <small className="text-xs font-semibold text-muted">표</small>
                  </>
                ),
                detail: `${p === 0 ? '파랑' : '빨강'} · 예비군 ${s.reserves[p]}${s.phase === 'setup' ? ` · 배치 ${s.setupLeft[p]}` : ''}`,
                active: !over && s.current === p,
                you: room.code !== null && seat === room.you,
                offline: info?.kind === 'human' && !info.online,
              }
            })}
          />
        }
        actions={actions}
      >
        <div className="flex h-full flex-col">
          <div className="shrink-0 px-3 pt-1.5">
            <TugBar s={s} />
            <div className="el-tug-legend">
              <span>선거인단 {TOTAL_SEATS}표</span>
              <span>{undecided > 0 ? `미확정 ${undecided}표` : '전 권역 확정'}</span>
            </div>
            <Steps s={s} who={who} />
          </div>
          <div className="relative min-h-0 flex-1">
            <BoardViewport maxZoom={2}>
              <div className="el-stage">
                <Board state={s} selectable={selectable} onHole={onHole} highlight={highlight} pulse={pulse} />
              </div>
            </BoardViewport>
          </div>
          <button type="button" className="el-ticker" aria-label={`최근 진행: ${lastLog} (눌러서 기록 보기)`} onClick={() => setMenu(true)}>
            <span className="el-ticker-tag el-disp">속보</span>
            <span className="el-ticker-text">{lastLog}</span>
          </button>
        </div>
      </GameShell>

      <Sheet open={menu} title="메뉴" onClose={() => setMenu(false)}>
        <h3 className="mt-0 mb-1 text-sm text-muted">기록</h3>
        <div className="max-h-56 overflow-y-auto">
          <LogList entries={room.log} />
        </div>
        <h3 className="mt-5 mb-2 text-sm text-muted">게임 방법</h3>
        <RulesText />
        <h3 className="mt-5 mb-2 text-sm text-muted">화면 테마</h3>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-raised p-1">
          {(['auto', 'light', 'dark'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={theme === k} className={`min-h-11 rounded-lg ${theme === k ? 'bg-surface font-bold' : 'text-muted'}`} onClick={() => onTheme(k)}>
              {THEME_LABEL[k]}
            </button>
          ))}
        </div>
        {leaving ? (
          <div className="mt-4 mb-2 rounded-xl border border-danger p-3">
            <p className="mt-0">{local ? '이 판을 그만두고 나갈까요? 이어 하기로 다시 열 수 있어요.' : '나가면 그 자리는 봇이 이어받고 돌아올 수 없습니다.'}</p>
            <div className="flex gap-2 *:flex-1">
              <Button onClick={() => setLeaving(false)}>계속하기</Button>
              <Button tone="danger" onClick={onLeave}>
                나가기
              </Button>
            </div>
          </div>
        ) : (
          <Button tone="danger" className="mt-4 mb-2 w-full" onClick={() => (inProgress ? setLeaving(true) : onLeave())}>
            나가기
          </Button>
        )}
      </Sheet>

      <Sheet open={resultOpen} title="개표 결과" onClose={() => setResultOpen(false)}>
        <Result s={v.game} names={names} mine={myColor} />
        <div className="mt-4 mb-2 flex flex-col gap-2">
          {local && (
            <Button tone="primary" onClick={local.again}>
              다시 하기
            </Button>
          )}
          <Button onClick={onLeave}>처음으로</Button>
          <Button tone="ghost" onClick={() => setResultOpen(false)}>
            보드 다시 보기
          </Button>
        </div>
      </Sheet>
    </>
  )
}
