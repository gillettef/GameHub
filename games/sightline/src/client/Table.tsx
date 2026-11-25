// 대국 화면. 배치(docs/refactor-plan.md 5절):
// ① 차례·할 일, 라운드·쫓는 대상 ② 후원자(차례 순서, 탭하면 상세) ③ 정원 보드와 고른 말 정보 ④ 내 명단·지목 카드·글라스
// ⑤ 접선·이동/지목/정찰·지목하지 않기 · ≡ 기록·내 정보·보드 읽는 법·규칙·나가기
import type { LogEntry, RoomSnapshot } from '@gamehub/net'
import { BoardViewport, Button, GameShell, PlayerStrip, ResultList, Sheet } from '@gamehub/ui'
import { useEffect, useState } from 'react'
import type { SeatView } from '../def'
import { DIRS, RENDEZVOUS, SEAT_INFO, cellName, type Crest, type Seat } from '../engine/board'
import { accusableIds, legalMoves, type Action, type LegalMove } from '../engine/rules'
import { Board } from './Board'
import { Legend, Rulebook, RulesText } from './RulesText'
import { KNOWN_LABEL, colorOf, crestName, seatLabel } from './seats'

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

type Ask = { kind: 'accuse'; pieceId: number; scout: boolean } | { kind: 'scout' } | null

const Dot = ({ c }: { c: Crest }) => <span className="inline-block size-2.5 shrink-0 rounded-full align-middle" style={{ background: colorOf(c) }} />

export function Table({ room, error, onAct, onLeave, local }: TableProps) {
  const v = room.view!
  const [menu, setMenu] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [autoShown, setAutoShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [detail, setDetail] = useState<Seat | null>(null)
  const [ask, setAsk] = useState<Ask>(null)
  const [hint, setHint] = useState<string | null>(null)
  // 고른 말·지목 모드는 그 상태(version)에서만 유효하다
  const [pick, setPick] = useState<{ version: number; sel: number | null; mode: 'move' | 'accuse' }>({ version: -1, sel: null, mode: 'move' })
  const sel = pick.version === room.version ? pick.sel : null
  const mode = pick.version === room.version ? pick.mode : 'move'
  const setSel = (s: number | null) => setPick({ version: room.version, sel: s, mode })
  const setMode = (m: 'move' | 'accuse') => setPick({ version: room.version, sel: null, mode: m })

  const nameOf = (seat: Seat) => room.seats[v.seats.indexOf(seat)]?.name ?? ''
  const names = Object.fromEntries(v.seats.map((s) => [s, nameOf(s)])) as Partial<Record<Seat, string>>
  const me = v.me != null ? v.players[v.me]! : null
  const mySeat = me?.seat ?? null
  const cur = v.players[v.turn]!
  const curName = nameOf(cur.seat)
  const over = v.phase === 'over'
  const mine = !over && room.status === 'playing' && room.you !== null && room.actors.includes(room.you) && me !== null
  const scouting = mine && v.phase === 'scout' && v.scout !== null && 'visible' in v.scout
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const inProgress = !over && (local ? humans > 0 : room.you !== null)
  const present = v.pieces.filter((p) => p.present)

  // 게임이 끝나면 잠시 뒤 결과를 한 번 띄운다
  useEffect(() => {
    if (!over || autoShown) return
    const id = setTimeout(() => {
      setResultOpen(true)
      setAutoShown(true)
    }, 700)
    return () => clearTimeout(id)
  }, [over, autoShown])

  // 다른 앱을 보는 동안 내 차례가 오면 탭 제목으로 알린다(옛 화면과 같다)
  useEffect(() => {
    const reset = () => {
      if (!document.hidden) document.title = 'SIGHTLINE · 사이트라인'
    }
    if (mine && document.hidden) document.title = '● 내 차례 · SIGHTLINE'
    document.addEventListener('visibilitychange', reset)
    return () => document.removeEventListener('visibilitychange', reset)
  }, [mine, room.version])

  // 짧은 안내(거절 이유 등)는 잠시 뒤 사라진다
  useEffect(() => {
    if (!hint) return
    const id = setTimeout(() => setHint(null), 3200)
    return () => clearTimeout(id)
  }, [hint])

  const send = (a: Action) => {
    setPick({ version: room.version, sel: null, mode: 'move' })
    setAsk(null)
    onAct(a)
  }

  const contactable = mine && v.phase === 'play' ? present.filter((q) => v.roster!.agents.includes(q.id) && RENDEZVOUS.some(([a, b]) => a === q.x && b === q.y)) : []
  const accusable = mine && v.phase === 'play' && me.card ? accusableIds(present, me.seat, me.seat, v.emptySeats) : []
  const moves = mine && v.phase === 'play' ? legalMoves(present, me.seat, v.emptySeats) : []
  const canPass = mine && v.phase === 'play' && !moves.length && !accusable.length && !contactable.length && me.glass <= 0

  let dests: LegalMove[] = []
  let highlight = new Set<number>()
  if (mine && v.phase === 'play') {
    if (mode === 'accuse') highlight = new Set(accusable)
    else if (sel != null) dests = moves.filter((m) => m.pieceId === sel)
  }
  if (scouting && me.card) highlight = new Set(present.filter((q) => q.facing === v.scout!.seat).map((q) => q.id))

  const onPiece = (pid: number) => {
    if (scouting) {
      const q = v.pieces[pid - 1]!
      if (me.card && q.facing === v.scout!.seat) setAsk({ kind: 'accuse', pieceId: pid, scout: true })
      else setHint(me.card ? '정찰한 좌석을 향한 말만 지목할 수 있습니다.' : '지목 카드가 없습니다.')
      return
    }
    if (mine && mode === 'accuse') {
      if (accusable.includes(pid)) setAsk({ kind: 'accuse', pieceId: pid, scout: false })
      else setHint('내 좌석을 향한 말만 지목할 수 있습니다.')
      return
    }
    setSel(sel === pid ? null : pid)
  }

  // ① 상태바
  const status = over
    ? '게임 종료'
    : scouting
      ? `${seatLabel(v.scout!.seat)} 좌석에서 정찰 중`
      : mine
        ? local && humans > 1
          ? `${nameOf(me.seat)} 차례 · 하나만 고르세요`
          : '내 차례 · 하나만 고르세요'
        : v.phase === 'scout' && v.scout
          ? `${curName} 정찰 중 (${seatLabel(v.scout.seat)})`
          : `${curName} 차례`
  const detailLine = over ? (
    `승자: ${(v.result?.winners ?? []).map((s) => nameOf(s)).join(', ')}`
  ) : (
    <>
      라운드 {v.round}/{v.rounds}
      {me && (
        <>
          {' · '}
          <Dot c={me.seat} /> {crestName(me.seat)} → 쫓는 대상 <Dot c={me.target} /> {crestName(me.target)}
        </>
      )}
    </>
  )

  // ③ 아래 한 줄: 고른 말 정보, 아니면 할 일 안내
  const selPiece = sel != null ? v.pieces.find((q) => q.id === sel && q.present) : undefined
  const infoLine = hint ? (
    <span className="text-danger">{hint}</span>
  ) : selPiece ? (
    <>
      <b>{selPiece.id}번</b> · {cellName(selPiece.x, selPiece.y)} · {seatLabel(selPiece.facing)}향
      {selPiece.crest && selPiece.known && (
        <>
          {' · '}
          <b style={{ color: colorOf(selPiece.crest) }}>{crestName(selPiece.crest)}</b> ({KNOWN_LABEL[selPiece.known]})
        </>
      )}
      {' · 이동: '}
      {DIRS.filter((s) => selPiece.moves[s])
        .map((s) => `${SEAT_INFO[s].label} ${selPiece.moves[s]}`)
        .join(', ') || '없음'}
      {mine && v.phase === 'play' && mode === 'move' && !dests.length && <span className="text-danger"> · 지금 옮길 수 없다</span>}
    </>
  ) : scouting ? (
    me.card ? (
      '이 좌석을 향한 말(빨간 점선)을 눌러 지목하거나, 지목하지 않기'
    ) : (
      '지목 카드가 없어 지목할 수 없습니다'
    )
  ) : mine ? (
    mode === 'accuse' ? (
      `빨간 점선 말을 눌러 ${crestName(me.target)} 첩자로 지목 · 맞으면 +2, 틀리면 −1·카드 잃음`
    ) : (
      '옮길 손님 말을 누르고 노란 칸으로 · 이동 방향이 곧 가면 방향'
    )
  ) : over ? (
    '모든 가면이 공개되었습니다. 누가 무엇을 알고 있었는지 확인해 보세요.'
  ) : me ? (
    '내 쪽을 향한 말, 누가 무엇을 옮겼는지가 단서입니다. 말을 누르면 정보가 보입니다.'
  ) : (
    '관전 중 · 문양은 게임이 끝나면 모두 공개됩니다. 말을 누르면 이동 이력이 보입니다.'
  )

  // ④ 내 영역
  const outLabel = (id: number) => {
    const q = v.pieces[id - 1]!
    if (q.present) return ''
    return q.out === 'contacted' ? ' 접선' : q.out === 'captured' ? ' 잡힘' : ' 떠남'
  }
  const hand =
    me && v.roster ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm" aria-label="내 정보">
        <span className="flex items-center gap-1">
          <span className="text-muted">첩자</span>
          {v.roster.agents.map((id) => (
            <span key={id} className={`rounded-md bg-raised px-1.5 font-bold ${outLabel(id) ? 'text-muted line-through' : ''}`} style={{ boxShadow: `inset 3px 0 0 ${colorOf(me.seat)}` }}>
              {id}
              {outLabel(id) && <small className="font-normal">{outLabel(id)}</small>}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-muted">중립</span>
          <span className={`rounded-md bg-raised px-1.5 font-bold ${outLabel(v.roster.neutral) ? 'text-muted line-through' : ''}`} style={{ boxShadow: `inset 3px 0 0 ${colorOf('X')}` }}>
            {v.roster.neutral}
          </span>
        </span>
        <span className={me.card ? '' : 'text-muted line-through'}>
          <Dot c={me.target} /> 지목 카드
        </span>
        <span className={me.glass > 0 ? '' : 'text-muted'}>글라스 {me.glass}</span>
      </div>
    ) : undefined

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
  } else if (scouting) {
    actions = (
      <Button tone="primary" onClick={() => send({ type: 'scoutAccuse', pieceId: null })}>
        지목하지 않기
      </Button>
    )
  } else if (mine) {
    actions = (
      <div className="flex flex-col gap-2">
        {contactable.map((q) => (
          <Button key={q.id} tone="primary" onClick={() => send({ type: 'contact', pieceId: q.id })}>
            {q.id}번 접선 +3
          </Button>
        ))}
        <div className="flex gap-2 *:flex-1">
          <Button aria-pressed={mode === 'move'} className={mode === 'move' ? 'ring-2 ring-primary' : ''} onClick={() => setMode('move')}>
            이동
          </Button>
          <Button aria-pressed={mode === 'accuse'} className={mode === 'accuse' ? 'ring-2 ring-primary' : ''} disabled={!accusable.length} onClick={() => setMode('accuse')}>
            지목 {accusable.length}
          </Button>
          <Button disabled={me.glass <= 0} onClick={() => setAsk({ kind: 'scout' })}>
            정찰 {me.glass}
          </Button>
          {canPass && (
            <Button tone="primary" onClick={() => send({ type: 'pass' })}>
              넘기기
            </Button>
          )}
        </div>
      </div>
    )
  } else {
    const waiting =
      room.seats[v.seats.indexOf(cur.seat)]?.kind === 'bot'
        ? `${curName} 생각 중…`
        : room.seats[v.seats.indexOf(cur.seat)]?.online === false
          ? `${curName}님 연결 끊김 · 곧 봇이 대신합니다`
          : room.you === null
            ? `${curName} 차례`
            : `${curName}님의 차례를 기다리는 중`
    actions = <p className="m-0 flex min-h-12 items-center justify-center rounded-xl bg-bg text-muted">{waiting}</p>
  }

  const detailPlayer = detail ? v.players.find((q) => q.seat === detail) : undefined
  const hunterOf = (seat: Seat) => v.players.find((q) => q.target === seat)
  const rows = v.result?.rows ?? []

  return (
    <>
      <GameShell
        status={status}
        detail={detailLine}
        onMenu={() => setMenu(true)}
        notice={error}
        players={
          <PlayerStrip
            onSelect={(k) => setDetail(v.players[k]!.seat)}
            players={v.players.map((pl, k) => {
              const s = room.seats[v.seats.indexOf(pl.seat)]
              return {
                id: k,
                name: s?.name ?? seatLabel(pl.seat),
                color: colorOf(pl.seat),
                score: pl.score,
                detail: `${SEAT_INFO[pl.seat].label}${pl.card ? '' : ' 카드✕'}${pl.glass ? ' 🔭' : ''}`,
                active: !over && k === v.turn,
                you: k === v.me,
                offline: s ? !s.online : false,
              }
            })}
          />
        }
        hand={hand}
        actions={actions}
      >
        <div className="flex h-full flex-col">
          <div className="relative min-h-0 flex-1" data-compact>
            <BoardViewport>
              <Board
                view={v}
                bottom={scouting ? v.scout!.seat : (mySeat ?? 'S')}
                names={names}
                highlight={highlight}
                dests={dests}
                selected={sel}
                scoutSeat={scouting ? v.scout!.seat : null}
                onPiece={onPiece}
                onDest={(m) => send({ type: 'move', pieceId: m.pieceId, dir: m.dir, steps: m.steps })}
              />
            </BoardViewport>
          </div>
          <p className="m-0 min-h-10 shrink-0 px-4 pb-1 text-sm leading-5 text-muted" aria-live="polite">
            {infoLine}
          </p>
        </div>
      </GameShell>

      <Sheet open={menu} title="메뉴" onClose={() => setMenu(false)}>
        <h3 className="mt-0 mb-1 text-sm text-muted">기록</h3>
        <GameLog entries={room.log} start={`게임 시작 · 첫 플레이어 ${seatLabel(v.players[0]!.seat)} ${nameOf(v.players[0]!.seat)}`} />
        {me && v.roster && (
          <>
            <h3 className="mt-5 mb-2 text-sm text-muted">내 정보</h3>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm [&_dt]:text-muted">
              <dt>나</dt>
              <dd className="m-0">
                <Dot c={me.seat} /> {seatLabel(me.seat)} · {crestName(me.seat)}
              </dd>
              <dt>쫓는 대상</dt>
              <dd className="m-0">
                <Dot c={me.target} /> {seatLabel(me.target)} {crestName(me.target)} {nameOf(me.target)}
              </dd>
              <dt>나를 쫓는 사람</dt>
              <dd className="m-0">
                <Dot c={hunterOf(me.seat)!.seat} /> {seatLabel(hunterOf(me.seat)!.seat)} {nameOf(hunterOf(me.seat)!.seat)}
                {hunterOf(me.seat)!.card ? '' : ' (카드 없음)'}
              </dd>
              <dt>내 첩자</dt>
              <dd className="m-0">{v.roster.agents.map((id) => `${id}${outLabel(id)}`).join(', ')}</dd>
              <dt>내 중립</dt>
              <dd className="m-0">
                {v.roster.neutral}
                {outLabel(v.roster.neutral)}
              </dd>
              <dt>지목 카드</dt>
              <dd className="m-0">{me.card ? `${crestName(me.target)} 카드 있음` : '없음'}</dd>
              <dt>오페라 글라스</dt>
              <dd className="m-0">{me.glass}</dd>
            </dl>
          </>
        )}
        <h3 className="mt-5 mb-2 text-sm text-muted">보드 읽는 법</h3>
        <Legend />
        <h3 className="mt-5 mb-2 text-sm text-muted">규칙 한눈에</h3>
        <RulesText />
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-primary">전체 룰북 펼치기</summary>
          <Rulebook />
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

      <Sheet open={detailPlayer !== undefined} title="후원자" onClose={() => setDetail(null)}>
        {detailPlayer && (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 [&_dt]:text-muted">
            <dt>좌석</dt>
            <dd className="m-0">
              <Dot c={detailPlayer.seat} /> {seatLabel(detailPlayer.seat)} · {crestName(detailPlayer.seat)} · {nameOf(detailPlayer.seat)}
              {detailPlayer.seat === mySeat ? ' (나)' : ''}
            </dd>
            <dt>쫓는 대상</dt>
            <dd className="m-0">
              <Dot c={detailPlayer.target} /> {seatLabel(detailPlayer.target)} {crestName(detailPlayer.target)}
            </dd>
            <dt>점수</dt>
            <dd className="m-0 font-bold">{detailPlayer.score}</dd>
            <dt>접선</dt>
            <dd className="m-0">{detailPlayer.contacted.length ? detailPlayer.contacted.join(', ') + '번' : '0'}</dd>
            <dt>포획</dt>
            <dd className="m-0">{detailPlayer.captured.length ? detailPlayer.captured.join(', ') + '번' : '0'}</dd>
            <dt>오인</dt>
            <dd className="m-0">{detailPlayer.mistakes}</dd>
            <dt>지목 카드</dt>
            <dd className="m-0">{detailPlayer.card ? '있음' : '없음'}</dd>
            <dt>오페라 글라스</dt>
            <dd className="m-0">{detailPlayer.glass}</dd>
          </dl>
        )}
      </Sheet>

      <Sheet open={ask?.kind === 'accuse'} title="지목" onClose={() => setAsk(null)}>
        {ask?.kind === 'accuse' && me && (
          <>
            <p className="mt-0">
              {ask.pieceId}번을 <b style={{ color: colorOf(me.target) }}>{crestName(me.target)}</b> 첩자로 지목할까요? 틀리면 오인 −1, 지목 카드를 잃습니다.
            </p>
            <div className="flex gap-2 *:flex-1">
              <Button onClick={() => setAsk(null)}>취소</Button>
              <Button tone="primary" onClick={() => send(ask.scout ? { type: 'scoutAccuse', pieceId: ask.pieceId } : { type: 'accuse', pieceId: ask.pieceId })}>
                지목
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={ask?.kind === 'scout'} title="정찰" onClose={() => setAsk(null)}>
        {me && (
          <>
            <p className="mt-0">어느 좌석에서 정찰할까요? 오페라 글라스는 게임에 한 번뿐입니다. 정찰한 뒤 그 좌석을 향한 말을 지목할 수 있습니다.</p>
            <div className="flex flex-col gap-2">
              {v.players
                .filter((_, k) => k !== v.me)
                .map((q) => (
                  <Button key={q.seat} onClick={() => send({ type: 'scout', seat: q.seat })}>
                    <Dot c={q.seat} /> {seatLabel(q.seat)} · {crestName(q.seat)} · {nameOf(q.seat)}
                  </Button>
                ))}
              <Button tone="ghost" onClick={() => setAsk(null)}>
                취소
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={resultOpen} title="결과" onClose={() => setResultOpen(false)}>
        <ResultList
          rows={rows.map((r) => ({
            id: r.i,
            name: `${SEAT_INFO[r.seat].label} · ${nameOf(r.seat)}`,
            score: `${r.score}점`,
            detail: `접선 ${r.contacts} · 포획 ${v.players[r.i]!.captured.length} · 오인 ${r.mistakes}`,
            winner: v.result?.winners.includes(r.seat) ?? false,
          }))}
        />
        <p className="text-sm text-muted">보드의 모든 가면이 공개되었습니다. 누가 무엇을 알고 있었는지 확인해 보세요.</p>
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

/** 게임 기록(최신이 위). 줄마다 라운드와 그 좌석 색 점(옛 화면과 같다) */
function GameLog({ entries, start }: { entries: readonly LogEntry[]; start: string }) {
  return (
    <ol className="m-0 list-none p-0">
      {[...entries].reverse().map((e) => {
        const seat = e.kind && e.kind !== 'sys' ? (e.kind as Seat) : null
        return (
          <li key={e.id} className="flex gap-2 border-b border-line py-2 text-sm">
            {seat ? <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: colorOf(seat) }} /> : <span className="w-2.5 shrink-0" />}
            <span>{e.text}</span>
          </li>
        )
      })}
      <li className="py-2 pl-[18px] text-sm text-muted">{start}</li>
    </ol>
  )
}
