// 대국 화면. 배치(docs/refactor-plan.md 5절):
// ① 단계·할 일, 라운드 ② 플레이어(점수·코어·설계자 점수·에너지, 탭하면 상세) ③ 아레나 + 지금 로봇의 두뇌(슬롯 3) + 최근 기록 한 줄
// ④ 설계: 뽑은 타일 5개 / 실행: 개입 고르기 ⑤ 확정·다시 고르기 · ≡ 기록·규칙·타일 목록·나가기
import type { LogEntry, RoomSnapshot } from '@gamehub/net'
import { BoardViewport, Button, GameShell, PlayerStrip, ResultList, Sheet } from '@gamehub/ui'
import { useEffect, useState, type ReactNode } from 'react'
import { MAX_ENERGY, cellName } from '../engine/data'
import { check, currentBot, designerOf, legalInterventions, ranking, score, targetOf, tileOf } from '../engine/engine'
import type { GameEvent, Intervention } from '../engine/types'
import type { Action, SeatView } from '../def'
import { COLORS, COLOR_NAMES, dirName, ivText } from '../text'
import { Board } from './Board'
import { preview } from './preview'
import { RulesText, TileList } from './RulesText'
import { TileFace, type TileMark } from './Tile'

/** 한 기기 대전에서만: 다시 하기 */
export interface LocalControls {
  again(): void
}

export interface TableProps {
  room: RoomSnapshot<SeatView>
  error: string | null
  onAct(a: Action): void
  onLeave(): void
  local?: LocalControls
}

const IVS: { iv: Intervention; label: string }[] = [
  { iv: { k: 'none' }, label: '개입 안 함' },
  { iv: { k: 'turn', dir: 'L' }, label: '좌회전' },
  { iv: { k: 'turn', dir: 'R' }, label: '우회전' },
  { iv: { k: 'thrust' }, label: '추진' },
  { iv: { k: 'block', slot: 0 }, label: '차단 1' },
  { iv: { k: 'block', slot: 1 }, label: '차단 2' },
  { iv: { k: 'block', slot: 2 }, label: '차단 3' },
]
const sameIv = (a: Intervention, b: Intervention) => JSON.stringify(a) === JSON.stringify(b)

const Dot = ({ i }: { i: number }) => <span className="inline-block size-2.5 shrink-0 rounded-full align-middle" style={{ background: COLORS[i] }} />

/** 이번 라운드에 그 로봇이 발동한 슬롯(기본 행동이면 -1, 아직이면 null) */
function lastTrigger(log: readonly GameEvent[], p: number): number | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!
    if (e.t === 'trigger' && e.p === p) return e.slot
    if (e.t === 'default' && e.p === p) return -1
  }
  return null
}

export function Table({ room, error, onAct, onLeave, local }: TableProps) {
  const v = room.view!
  const [menu, setMenu] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [autoShown, setAutoShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [detail, setDetail] = useState<number | null>(null)
  // 고르던 것(설계 슬롯·개입)은 그 상태(version)에서만 유효하다. 설계는 라운드 동안 유지한다
  const [picks, setPicks] = useState<{ key: string; slots: (number | null)[] }>({ key: '', slots: [null, null, null] })
  const [ivPick, setIvPick] = useState<{ version: number; iv: Intervention }>({ version: -1, iv: { k: 'none' } })

  const nameOf = (i: number) => room.seats[i]?.name || v.players[i]?.name || `${i + 1}번`
  const me = room.you
  const over = v.phase === 'done'
  const mine = !over && room.status === 'playing' && me !== null && room.actors.includes(me)
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const hotseat = !!local && humans > 1
  const inProgress = !over && (local ? humans > 0 : me !== null)
  const cur = v.phase === 'exec' ? currentBot(v) : null
  const pickKey = `${v.round}:${room.you}`
  const slots = picks.key === pickKey ? picks.slots : [null, null, null]
  const iv = ivPick.version === room.version ? ivPick.iv : { k: 'none' as const }

  // 게임이 끝나면 잠시 뒤 결과를 한 번 띄운다
  useEffect(() => {
    if (!over || autoShown) return
    const id = setTimeout(() => {
      setResultOpen(true)
      setAutoShown(true)
    }, 700)
    return () => clearTimeout(id)
  }, [over, autoShown])

  // 다른 앱을 보는 동안 내 차례가 오면 탭 제목으로 알린다
  useEffect(() => {
    const reset = () => {
      if (!document.hidden) document.title = 'PROXYMIND · 프록시마인드'
    }
    if (mine && document.hidden) document.title = '● 내 차례 · PROXYMIND'
    document.addEventListener('visibilitychange', reset)
    return () => document.removeEventListener('visibilitychange', reset)
  }, [mine, room.version])

  const send = (a: Action) => {
    setIvPick({ version: room.version, iv: { k: 'none' } })
    onAct(a)
  }

  const designing = mine && v.phase === 'design'
  const piloting = mine && v.phase === 'exec'
  const target = me !== null && v.phase === 'design' && !v.players[me]?.pending ? targetOf(v, me) : null
  const submitted = v.players.filter((p) => p.pending).length

  // ① 상태바
  const who = (i: number) => (hotseat ? `${nameOf(i)} · ` : '')
  const status = over
    ? '게임 종료'
    : designing
      ? `${who(me!)}설계: ${nameOf(target!)} 로봇의 두뇌`
      : piloting
        ? `${who(me!)}내 로봇의 실행 차례`
        : v.phase === 'design'
          ? me !== null && v.players[me]?.pending
            ? '설계 완료 · 다른 설계자를 기다리는 중'
            : '설계 단계'
          : `${nameOf(cur!)} 로봇 실행 중`
  const detailLine = over ? (
    `1위: ${ranking(v)
      .filter((r) => r.rank === 1)
      .map((r) => nameOf(r.p))
      .join(', ')}`
  ) : (
    <>
      {v.round}/{v.rounds} 라운드 · {v.phase === 'design' ? `설계 ${submitted}/${v.n}` : `실행 ${v.turn + 1}/${v.n}`}
      {me !== null && v.players[me] && (
        <>
          {' · '}
          <Dot i={me} /> 에너지 {v.players[me]!.energy}/{MAX_ENERGY}
        </>
      )}
    </>
  )

  // ③ 두뇌 줄: 설계 중이면 내가 짜는 슬롯, 실행 중이면 지금 로봇의 두뇌
  const pv = piloting ? preview(v, iv) : null
  let brainTitle: ReactNode
  let brain: ReactNode
  if (designing) {
    brainTitle = (
      <>
        <Dot i={target!} /> {nameOf(target!)} 로봇에 꽂을 슬롯 · 슬롯 1부터 검사 · 누르면 빼기
      </>
    )
    brain = slots.map((inst, k) => (
      <button
        key={k}
        type="button"
        className="pm-slot-btn"
        aria-label={inst === null ? `슬롯 ${k + 1} 비어 있음` : `슬롯 ${k + 1}에서 빼기`}
        disabled={inst === null}
        onClick={() => setPicks({ key: pickKey, slots: slots.map((x, j) => (j === k ? null : x)) })}
      >
        <TileFace view={v} inst={inst} label={`슬롯 ${k + 1}`} />
      </button>
    ))
  } else if (cur !== null) {
    const p = v.players[cur]!
    const fired = lastTrigger(v.log, cur)
    const blockedSlot = piloting && iv.k === 'block' ? iv.slot : p.blocked
    brainTitle = (
      <>
        <Dot i={cur} /> {nameOf(cur)} 로봇의 두뇌 · 설계자 <Dot i={designerOf(v, cur)} /> {nameOf(designerOf(v, cur))}
      </>
    )
    brain = p.brain.map((inst, k) => {
      const mark: TileMark = blockedSlot === k ? 'blocked' : fired === k ? 'fired' : pv?.slot === k ? 'would' : null
      return (
        <div key={k} className="pm-slot-box">
          <TileFace view={v} inst={inst} mark={mark} label={`슬롯 ${k + 1}`} />
        </div>
      )
    })
  } else {
    brainTitle = over ? '최종 점수 · 코어 1개 2점, 설계자 점수 1개 1점' : `설계 중 · 놓기를 마친 설계자 ${submitted}/${v.n}`
    brain = null
  }

  // ③ 아래 한 줄: 개입 미리보기, 아니면 최근 기록
  const lastLog = room.log.at(-1)
  const infoLine = piloting ? (
    pv ? (
      <>
        <b>{ivText(iv)}</b> → {pv.text}
      </>
    ) : (
      '할 수 없는 개입입니다'
    )
  ) : designing ? (
    '타일을 누르면 빈 슬롯에 순서대로 들어갑니다. 로봇이 규칙 때문에 충돌하거나 조종사가 에너지 2개를 쓰면 내가 1점.'
  ) : lastLog ? (
    lastLog.text
  ) : (
    '규칙 타일을 뽑았습니다. 오른쪽 로봇의 두뇌를 짜세요.'
  )

  // ④ 내 영역
  let hand: ReactNode
  if (designing) {
    const mineP = v.players[me!]!
    hand = (
      <div className="grid grid-cols-3 gap-1.5 p-2" aria-label="뽑은 타일">
        {mineP.hand.map((inst) => {
          const used = slots.includes(inst)
          const truth = check(v, target!, tileOf(v, inst).cond)
          return (
            <button
              key={inst}
              type="button"
              className="pm-hand-btn"
              disabled={used}
              aria-label={`${tileOf(v, inst).text} 꽂기`}
              onClick={() => {
                const k = slots.indexOf(null)
                if (k >= 0) setPicks({ key: pickKey, slots: slots.map((x, j) => (j === k ? inst : x)) })
              }}
            >
              <TileFace view={v} inst={inst} mark={used ? 'used' : null} />
              <span className={`pm-truth ${truth ? 'pm-yes' : 'pm-no'}`}>지금 {truth ? '참' : '거짓'}</span>
            </button>
          )
        })}
      </div>
    )
  } else if (piloting) {
    const legal = legalInterventions(v)
    hand = (
      <div className="p-2" aria-label="개입">
        <div className="grid grid-cols-4 gap-1.5">
          {IVS.map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={sameIv(o.iv, iv)}
              disabled={!legal.some((l) => sameIv(l, o.iv))}
              className={`min-h-11 rounded-lg px-1 text-sm disabled:opacity-35 ${sameIv(o.iv, iv) ? 'bg-primary font-bold text-on-primary' : 'bg-raised'} ${o.iv.k === 'none' ? 'col-span-1' : ''}`}
              onClick={() => setIvPick({ version: room.version, iv: o.iv })}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="m-0 mt-1.5 text-xs text-muted">개입은 에너지 1 (보유 {v.players[me!]!.energy}). 쓴 에너지는 2개마다 설계자 1점.</p>
      </div>
    )
  }

  // ⑤ 행동
  let actions
  if (over) {
    actions = (
      <div className="flex gap-2 *:flex-1">
        <Button tone="primary" onClick={() => setResultOpen(true)}>
          결과 보기
        </Button>
        <Button onClick={onLeave}>처음으로</Button>
      </div>
    )
  } else if (designing) {
    actions = (
      <div className="flex gap-2">
        <Button tone="ghost" disabled={slots.every((x) => x === null)} onClick={() => setPicks({ key: pickKey, slots: [null, null, null] })}>
          다시 고르기
        </Button>
        <Button tone="primary" className="flex-1" disabled={slots.some((x) => x === null)} onClick={() => send({ type: 'design', slots: slots as number[] })}>
          확정
        </Button>
      </div>
    )
  } else if (piloting) {
    actions = (
      <Button tone="primary" disabled={!pv} onClick={() => send({ type: 'intervene', iv })}>
        확정 · {ivText(iv)}
      </Button>
    )
  } else {
    let waiting: string
    if (v.phase === 'design') {
      const left = room.actors.filter((i) => i !== me)
      waiting = left.length ? `설계 중: ${left.map(nameOf).join(', ')}` : '공개 중…'
    } else {
      const seat = room.seats[cur!]
      waiting =
        seat?.kind === 'bot'
          ? `${nameOf(cur!)} 생각 중…`
          : seat?.online === false
            ? `${nameOf(cur!)}님 연결 끊김 · 곧 봇이 대신합니다`
            : `${nameOf(cur!)} 조종사가 고르는 중…`
    }
    actions = <p className="m-0 flex min-h-12 items-center justify-center rounded-xl bg-bg px-2 text-center text-sm text-muted">{waiting}</p>
  }

  const dp = detail !== null ? v.players[detail] : undefined
  const rk = ranking(v)

  return (
    <>
      <GameShell
        status={status}
        detail={detailLine}
        onMenu={() => setMenu(true)}
        notice={error}
        players={
          <PlayerStrip
            onSelect={setDetail}
            players={v.players.map((p, i) => ({
              id: i,
              name: nameOf(i),
              color: COLORS[i]!,
              score: score(v, i),
              detail: `◆${p.cores}✎${p.dp}⚡${p.energy}${v.phase === 'design' && p.pending ? ' ✓' : ''}`,
              active: !over && room.actors.includes(i),
              you: i === me,
              offline: room.seats[i] ? !room.seats[i]!.online : false,
            }))}
          />
        }
        hand={hand}
        actions={actions}
      >
        <div className="flex h-full flex-col">
          <div className="relative min-h-0 flex-1">
            <BoardViewport>
              <Board view={v} active={cur} target={target} focus={designing ? target : cur} />
            </BoardViewport>
          </div>
          <div className="shrink-0 px-2">
            <p className="m-0 truncate px-1 pb-1 text-xs text-muted">{brainTitle}</p>
            {brain && <div className="grid grid-cols-3 gap-1.5">{brain}</div>}
          </div>
          <p className="m-0 line-clamp-2 min-h-10 shrink-0 px-3 pt-1 text-sm leading-5 text-muted" aria-live="polite">
            {infoLine}
          </p>
        </div>
      </GameShell>

      <Sheet open={menu} title="메뉴" onClose={() => setMenu(false)}>
        <h3 className="mt-0 mb-1 text-sm text-muted">기록</h3>
        <GameLog entries={room.log} />
        <h3 className="mt-5 mb-2 text-sm text-muted">규칙 요약</h3>
        <RulesText />
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-primary">규칙 타일 20종 (45개)</summary>
          <TileList />
        </details>
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

      <Sheet open={dp !== undefined} title="플레이어" onClose={() => setDetail(null)}>
        {dp && detail !== null && (
          <>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm [&_dt]:text-muted">
              <dt>이름</dt>
              <dd className="m-0">
                <Dot i={detail} /> {nameOf(detail)} ({COLOR_NAMES[detail]}){detail === me ? ' · 나' : ''}
                {room.seats[detail]?.kind === 'bot' ? ' · 봇' : ''}
              </dd>
              <dt>점수</dt>
              <dd className="m-0 font-bold">
                {score(v, detail)}점 (코어 {dp.cores} × 2 + 설계자 점수 {dp.dp})
              </dd>
              <dt>에너지</dt>
              <dd className="m-0">
                {dp.energy}/{MAX_ENERGY}
              </dd>
              <dt>쓴 에너지</dt>
              <dd className="m-0">
                {'●'.repeat(dp.spent)}
                {'○'.repeat(Math.max(0, 2 - dp.spent))} (2개마다 설계자 1점)
              </dd>
              <dt>로봇</dt>
              <dd className="m-0">
                {cellName(dp.bot)} · {dirName(dp.bot.dir)} 방향
              </dd>
              <dt>내 로봇 설계자</dt>
              <dd className="m-0">
                <Dot i={designerOf(v, detail)} /> {nameOf(designerOf(v, detail))}
              </dd>
              <dt>내가 짜는 로봇</dt>
              <dd className="m-0">
                <Dot i={targetOf(v, detail)} /> {nameOf(targetOf(v, detail))}
              </dd>
            </dl>
            <h3 className="mt-4 mb-1.5 text-sm text-muted">두뇌 (이번 라운드)</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {[0, 1, 2].map((k) => {
                const designer = v.players[designerOf(v, detail)]!
                const inst = dp.brain[k] ?? (v.phase === 'design' && designer.pending ? -1 : null)
                const fired = v.phase === 'exec' ? lastTrigger(v.log, detail) : null
                return <TileFace key={k} view={v} inst={inst} mark={dp.blocked === k ? 'blocked' : fired === k ? 'fired' : null} label={`슬롯 ${k + 1}`} />
              })}
            </div>
            {v.phase === 'exec' && lastTrigger(v.log, detail) === -1 && <p className="mb-0 text-sm text-muted">이번 라운드: 발동한 규칙 없음 → 기본 행동</p>}
          </>
        )}
      </Sheet>

      <Sheet open={resultOpen} title="결과" onClose={() => setResultOpen(false)}>
        <ResultList
          rows={rk.map((r) => ({
            id: r.p,
            name: `${r.rank}위 · ${nameOf(r.p)}`,
            score: `${r.score}점`,
            detail: `코어 ${v.players[r.p]!.cores} · 설계자 점수 ${v.players[r.p]!.dp}`,
            winner: r.rank === 1,
          }))}
        />
        <div className="mt-3 flex flex-col gap-2">
          {local && (
            <Button tone="primary" onClick={local.again}>
              다시 하기
            </Button>
          )}
          <Button onClick={() => setResultOpen(false)}>보드 보기</Button>
          <Button onClick={onLeave}>처음으로</Button>
        </div>
      </Sheet>
    </>
  )
}

/** 게임 기록(최신이 위). 줄마다 그 좌석 색 점 */
function GameLog({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <ol className="m-0 list-none p-0">
      {[...entries].reverse().map((e) => {
        const seat = e.kind && e.kind !== 'sys' ? Number(e.kind) : null
        return (
          <li key={e.id} className={`flex gap-2 border-b border-line py-2 text-sm ${e.text.startsWith('—') ? 'font-bold text-primary' : ''}`}>
            {seat !== null ? <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: COLORS[seat] }} /> : <span className="w-2.5 shrink-0" />}
            <span>{e.text}</span>
          </li>
        )
      })}
      <li className="py-2 pl-[18px] text-sm text-muted">게임 시작 · 1라운드</li>
    </ol>
  )
}
