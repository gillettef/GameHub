// 대국 화면. 배치(docs/refactor-plan.md 5절):
// ① 계절·단계·남은 시간 ② 이야기꾼(점수·준비·질문자) ③ 섬 보드 + 이번 단계 안내·공개 결과 + 흩어지는 말
// ④ 내 구역 카드 / 질문 후보 / 증언 토큰 ⑤ 카드 놓기·질문하기·주먹 내밀기·말하기
// 시간은 진행 쪽 시계로 흐른다. 화면은 받은 뒤 흐른 시간만큼 남은 시간·말의 수명을 줄여 보여 준다(표시용 예측).
// 지난 기록·지난 말은 남기지 않는다(기둥 1): 기록 창이 없고, 말은 20초 뒤 화면에서도 사라진다.
import type { RoomSnapshot } from '@gamehub/net'
import { Button, GameShell, PlayerStrip, ResultList, Sheet } from '@gamehub/ui'
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { TEXT_MAX, type Action, type View } from '../def'
import { eunNeun } from '../engine/bot'
import { HOUSES, SEASONS, type PlotId } from '../engine/rules'
import { RulesText } from './RulesText'

export interface LocalControls {
  paused: boolean
  setPaused(paused: boolean): void
  again(): void
}

export interface TableProps {
  room: RoomSnapshot<View>
  error: string | null
  onAct(a: Action): void
  onLeave(): void
  local?: LocalControls
}

const PERSONA: Record<string, string> = { archivist: '기록형', politician: '정치형', schemer: '조작형', follower: '휩쓸림형' }
const PHASE: Record<string, string> = { claim: '점유', claimResult: '점유 공개', choose: '질문 칸 고르기', whisper: '속삭임', result: '증언 공개', ended: '게임 끝' }
const HOUSE_NAME: Record<string, string> = { ...Object.fromEntries(HOUSES.map((h) => [h.id, h.name])), grey: '회색' }
const colorVar = (c: string) => `var(--hs-${c})`

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
    }, 250)
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
    t = performance.now()
    receivedAt.set(v, t)
  }
  return t
}

function Dot({ c, className = '' }: { c: string; className?: string }) {
  return <span className={`hs-dot ${c === 'black' ? 'hs-dot-black' : ''} ${className}`} style={{ background: colorVar(c) }} aria-hidden="true" />
}

interface Pick {
  stage: string
  claim?: PlotId
  ask?: { plot: PlotId; season: number }
  token?: string
}

export function Table({ room, error, onAct, onLeave, local }: TableProps) {
  const now = useSyncExternalStore(clockStore.subscribe, clockStore.get)
  const v = room.view!
  const running = room.status === 'playing' && !local?.paused
  const elapsed = running ? Math.max(0, now - stamp(v)) : 0
  const left = v.deadlineIn === null ? null : Math.max(0, v.deadlineIn - elapsed)
  const me = v.me
  const watching = me === null
  const over = v.phase === 'ended'
  const isQ = !!me && v.questioner === me.index && v.phase === 'choose'
  const nameOf = (i: number) => v.players[i]?.name ?? '?'
  const plotName = (id: string) => v.board.find((b) => b.id === id)?.name ?? id
  const answerLabel = (c: string) => {
    if (c === 'grey') return '아무도 없었다'
    if (c === 'empty' || c === 'none') return '빈 주먹'
    const i = v.players.findIndex((p) => p.color === c)
    return `${HOUSE_NAME[c] ?? c}${i >= 0 ? ` (${nameOf(i)})` : ''}`
  }

  // 고른 카드·칸·토큰은 그 단계 안에서만
  const stage = `${v.phase}|${v.season}|${v.council?.kind ?? ''}|${v.council?.left ?? ''}|${v.question?.plot ?? ''}|${v.question?.season ?? ''}`
  const [pick, setPick] = useState<Pick>({ stage })
  const cur: Pick = pick.stage === stage ? pick : { stage }
  const choose = (p: Omit<Pick, 'stage'>) => setPick({ stage, ...p })

  const [menu, setMenu] = useState(false)
  const [rules, setRules] = useState(false)
  const [talk, setTalk] = useState(false)
  const [text, setText] = useState('')
  const [resultOpen, setResultOpen] = useState(false)
  const [autoShown, setAutoShown] = useState(false)
  useEffect(() => {
    if (!over || autoShown) return
    const id = setTimeout(() => {
      setResultOpen(true)
      setAutoShown(true)
    }, 800)
    return () => clearTimeout(id)
  }, [over, autoShown])

  const act = (a: Action) => {
    setPick({ stage })
    onAct(a)
  }
  const blocked = !!local?.paused
  const canTalk = !watching && v.canSpeak && !over && !blocked
  const chat = v.chat.filter((m) => m.ttl - elapsed > 0)

  // ---------------------------------------------------------------- ①
  const seasonLabel = v.council?.kind === 'final' || over ? '마지막 회의' : `${v.season}계절 / ${SEASONS}`
  const q = v.question
  const qName = q ? `${q.season}계절 ${plotName(q.plot)}` : ''
  let status: string
  if (over) status = '게임 끝 — 공식 역사가 완성되었습니다'
  else if (local?.paused) status = '일시정지 — 시간이 멈췄습니다'
  else if (v.phase === 'claim') status = watching ? '점유 — 모두 구역 카드를 고르는 중' : me!.claim ? `${plotName(me!.claim)} 카드를 놓았습니다 · 기다리는 중` : '구역 카드 한 장을 고르세요'
  else if (v.phase === 'claimResult') status = v.season > 1 ? `점유 공개 · 곧 ${v.season - 1}계절 땅이 사라집니다` : '점유 공개'
  else if (v.phase === 'choose') status = isQ ? '당신이 질문자 · 물을 칸을 고르세요' : `${nameOf(v.questioner)} 질문 칸 고르는 중 · 침묵`
  else if (v.phase === 'whisper') status = watching ? `속삭임 · “${qName}”` : me!.fist ? `주먹을 내밀었습니다 · ${answerLabel(me!.fist)}` : '주장하고 증언 토큰을 고르세요'
  else status = `증언 공개 · ${qName}`
  const detail = (
    <span className="tabular-nums">
      {seasonLabel} · {PHASE[v.phase] ?? v.phase}
      {v.council ? ` · 남은 질문 ${v.council.left}` : ''}
      {left !== null && !over && <b className="ml-1.5 text-primary">⏱ {Math.ceil(left / 1000)}초</b>}
    </span>
  )

  // ---------------------------------------------------------------- ③ 보드
  const drawn = new Map((v.drawn ?? []).map((d) => [d.id, d.askable]))
  const feuds = v.claimReveal?.feuds ?? []
  const colLabel = (s: number) => (s <= v.forgotten ? '망각' : s === v.season ? '이번' : s === v.season - 1 && s > v.forgotten ? '직전' : '')
  const board = (
    <div className="hs-board" data-compact style={{ gridTemplateRows: `auto repeat(${v.board.length}, var(--hs-row))` }} role="group" aria-label="섬 보드">
      <div />
      {Array.from({ length: SEASONS }, (_, k) => (
        <div key={k} className={`hs-colh ${k + 1 === v.season && !over ? 'cur' : ''}`}>
          {k + 1}
          <small>{colLabel(k + 1)}</small>
        </div>
      ))}
      {v.board.map((row) => (
        <BoardRow
          key={row.id}
          row={row}
          v={v}
          recall={drawn.has(row.id)}
          askable={isQ && !blocked ? (drawn.get(row.id) ?? []) : []}
          feud={v.phase === 'claimResult' && feuds.includes(row.id)}
          picked={cur.ask?.plot === row.id ? cur.ask.season : null}
          onAsk={(season) => choose({ ask: { plot: row.id, season } })}
        />
      ))}
    </div>
  )

  // ---------------------------------------------------------------- ③ 안내·공개
  let panel: ReactNode = null
  switch (v.phase) {
    case 'claim':
      panel = (
        <p className="m-0 text-sm text-muted">
          모두 동시에 공개합니다. 같은 구역을 고른 사람끼리는 <b className="text-text">다툼</b>이 되어 아무도 갖지 못합니다.
          {v.season > 1 && <> 직전 계절의 땅은 이번 공개 뒤 사라집니다. 지금 잘 봐 두세요.</>}
        </p>
      )
      break
    case 'claimResult':
      panel = (
        <div className="hs-reveal">
          {v.claimReveal!.picks.map((pid, i) => (
            <div key={i}>
              <span className="truncate text-xs text-muted">
                <Dot c={v.players[i]!.color} /> {nameOf(i)}
              </span>
              <b>{plotName(pid)}</b>
              {v.claimReveal!.feuds.includes(pid) && <span className="text-xs text-danger">다툼</span>}
            </div>
          ))}
        </div>
      )
      break
    case 'choose':
      panel = (
        <p className="m-0 text-sm text-muted">
          회상 카드: <b className="text-text">{(v.drawn ?? []).map((d) => plotName(d.id)).join(', ')}</b>.{' '}
          {isQ ? '보드의 밝은 테두리 칸(망각된 계절, 아직 기록 없음)이나 아래 후보를 고르세요. 당신도 자기 집안 색은 증언할 수 없습니다.' : '선언 전에는 아무도 말할 수 없습니다.'}
        </p>
      )
      break
    case 'whisper':
      panel = (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 font-bold">“{qName}의 주인은 누구였나?”</p>
          <div className="hs-bar" aria-hidden="true">
            <i style={{ width: `${((left ?? 0) / 60_000) * 100}%` }} />
          </div>
          {me && <p className="m-0 text-sm text-muted">{me.fist ? `주먹 안: ${answerLabel(me.fist)} (공개 전까지 바꿀 수 없음)` : `당신(${HOUSE_NAME[me.color]})의 색 토큰은 없습니다.`}</p>}
        </div>
      )
      break
    case 'result': {
      const r = v.result!
      const counts =
        Object.entries(r.counts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, c]) => `${answerLabel(k)} ${c}`)
          .join(' · ') || '유효한 증언 없음'
      panel = (
        <div className="flex flex-col gap-1.5">
          <div className="hs-reveal">
            {r.fists.map((f, i) => (
              <div key={i}>
                <span className="truncate text-xs text-muted">
                  {nameOf(i)}
                  {i === v.questioner ? ' · 질문자' : ''}
                </span>
                <span className="truncate text-sm">
                  {f === 'none' || f === 'empty' ? '✊ 빈 주먹' : <><Dot c={f} /> {f === 'grey' ? '아무도' : HOUSE_NAME[f]}</>}
                </span>
                {r.gains[i] ? <b className="text-primary">+{r.gains[i]}</b> : null}
              </div>
            ))}
          </div>
          <p className="m-0 text-xs text-muted">{counts}</p>
          <p className="m-0 font-bold">{r.blank ? '공백 — 아무것도 기록되지 않았다' : r.official === 'grey' ? '공식 역사: 아무도 없었다' : `공식 역사: ${answerLabel(r.official!)}`}</p>
        </div>
      )
      break
    }
    case 'ended':
      panel = <p className="m-0 text-sm text-muted">실제로 무슨 일이 있었는지는 아무도 모릅니다. 진실은 망각 주머니 속에 영원히 남습니다.</p>
      break
  }

  const chatList = (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="말 (20초 뒤 흩어짐)" aria-live="polite">
      {chat.map((m) => {
        const life = m.ttl - elapsed
        const pl = v.players[m.from]!
        return (
          <li key={m.id} className={`hs-msg ${m.assert ? 'assert' : ''}`} style={{ opacity: life < 4000 ? Math.max(0.15, life / 4000) : 1 }}>
            <b style={{ color: colorVar(pl.color === 'black' ? 'black-text' : pl.color) }}>{pl.name}</b> {m.text}
          </li>
        )
      })}
    </ul>
  )

  // ---------------------------------------------------------------- ④
  let hand: ReactNode = undefined
  if (me && !blocked && !over) {
    if (v.phase === 'claim' && !me.claim) {
      hand = (
        <div className="hs-hand">
          <p className="hs-hand-title">내 구역 카드</p>
          <div className="grid grid-cols-3 gap-1.5">
            {v.board.map((b) => (
              <button key={b.id} type="button" aria-pressed={cur.claim === b.id} className="hs-choice" onClick={() => choose({ claim: b.id })}>
                <span className="truncate">{b.name}</span>
                <b className="text-muted">{b.value}</b>
              </button>
            ))}
          </div>
        </div>
      )
    } else if (isQ) {
      const options = (v.drawn ?? []).flatMap((d) => d.askable.map((s) => ({ plot: d.id, season: s })))
      hand = (
        <div className="hs-hand">
          <p className="hs-hand-title">질문 후보</p>
          <div className="grid grid-cols-3 gap-1.5">
            {options.map((o) => (
              <button
                key={`${o.plot}${o.season}`}
                type="button"
                aria-pressed={cur.ask?.plot === o.plot && cur.ask.season === o.season}
                className="hs-choice"
                onClick={() => choose({ ask: o })}
              >
                <span className="truncate">
                  {o.season}계절 {plotName(o.plot)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )
    } else if (v.phase === 'whisper' && !me.fist) {
      hand = (
        <div className="hs-hand">
          <p className="hs-hand-title">증언 토큰 · 고른 뒤 주먹 내밀기</p>
          <div className="grid grid-cols-3 gap-1.5">
            {me.tokens.map((t) => (
              <button key={t} type="button" aria-pressed={cur.token === t} className="hs-choice" aria-label={t === 'empty' ? '빈 주먹' : answerLabel(t)} onClick={() => choose({ token: t })}>
                {t === 'empty' ? (
                  <span>✊ 빈 주먹</span>
                ) : (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Dot c={t} />
                    <span className="truncate">{t === 'grey' ? '아무도 없었다' : nameOf(v.players.findIndex((p) => p.color === t))}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )
    }
  }

  // ---------------------------------------------------------------- ⑤
  const talkButton = (
    <Button key="talk" disabled={!canTalk} onClick={() => setTalk(true)} className="max-w-32">
      {v.canSpeak || over ? `💬 말${chat.length ? ` ${chat.length}` : ''}` : '🤫 침묵'}
    </Button>
  )
  let actions: ReactNode
  if (over) {
    actions = (
      <>
        <Button tone="primary" onClick={() => setResultOpen(true)}>
          결과 보기
        </Button>
        <Button onClick={onLeave}>처음으로</Button>
      </>
    )
  } else if (watching) {
    actions = <p className="m-0 flex items-center justify-center text-muted">{room.code ? '관전 중' : '봇끼리 진행 중'}</p>
  } else if (v.phase === 'claim' && !me.claim) {
    actions = (
      <>
        {talkButton}
        <Button tone="primary" disabled={!cur.claim || blocked} onClick={() => cur.claim && act({ type: 'claim', plot: cur.claim })}>
          {cur.claim ? `${plotName(cur.claim)} 카드 놓기` : '카드를 고르세요'}
        </Button>
      </>
    )
  } else if (isQ) {
    actions = (
      <Button tone="primary" disabled={!cur.ask || blocked} onClick={() => cur.ask && act({ type: 'ask', ...cur.ask })}>
        {cur.ask ? `${cur.ask.season}계절 ${plotName(cur.ask.plot)} 묻기` : '물을 칸을 고르세요'}
      </Button>
    )
  } else if (v.phase === 'whisper' && !me.fist) {
    actions = (
      <>
        {talkButton}
        <Button tone="primary" disabled={!cur.token || blocked} onClick={() => cur.token && act({ type: 'fist', choice: cur.token })}>
          ✊ 주먹 내밀기
        </Button>
      </>
    )
  } else {
    actions = talkButton
  }

  // ---------------------------------------------------------------- 말 시트
  const send = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t || !canTalk) return
    setText('')
    onAct({ type: 'say', text: t, assert: null })
  }
  const assertText = (c: string) => {
    const pn = plotName(q!.plot)
    const jn = eunNeun(pn)
    if (c === me!.color) return `${q!.season}계절 ${pn}${jn} 내 땅이었어.`
    if (c === 'grey') return `${q!.season}계절 ${pn}엔 아무도 없었어.`
    return `${q!.season}계절 ${pn}${jn} ${HOUSE_NAME[c]}(${nameOf(v.players.findIndex((p) => p.color === c))}) 땅이었어.`
  }

  // ---------------------------------------------------------------- 결과(룰북 7장: 점수 → 자기 색 기록 표지 수 → 함께 승리)
  const marks = (c: string) => v.board.reduce((a, b) => a + b.cells.filter((x) => x.chron === c).length, 0)
  const ranked = v.players.map((p, i) => ({ ...p, i, marks: marks(p.color) })).sort((a, b) => b.score - a.score || b.marks - a.marks)
  const top = ranked[0]
  const winners = new Set(ranked.filter((p) => top && p.score === top.score && p.marks === top.marks).map((p) => p.i))

  return (
    <>
      <GameShell
        status={status}
        detail={detail}
        onMenu={() => setMenu(true)}
        notice={error}
        players={
          <PlayerStrip
            players={v.players.map((p, i) => ({
              id: i,
              name: me?.index === i && p.name !== '나' ? `${p.name} (나)` : p.name,
              color: colorVar(p.color),
              score: p.score,
              detail: p.ready ? '✓ 냄' : !over && v.questioner === i ? '질문자' : p.isBot ? (PERSONA[p.persona ?? ''] ?? '봇') : room.seats[i]?.kind === 'bot' ? '대리' : '사람',
              active: !over && v.questioner === i,
              you: me?.index === i && room.code !== null,
              offline: room.seats[i]?.online === false,
            }))}
          />
        }
        hand={hand}
        actions={actions}
      >
        <div className="flex h-full flex-col gap-2 px-3 pt-1 pb-2">
          {board}
          <div className="hs-panel min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {panel}
            {chat.length > 0 && <div className="mt-2 border-t border-line pt-2">{chatList}</div>}
          </div>
        </div>
      </GameShell>

      <Sheet open={talk} title={v.canSpeak ? '말 · 20초 뒤 흩어집니다' : '지금은 침묵해야 합니다'} onClose={() => setTalk(false)}>
        <div className="flex flex-col gap-2 pb-2">
          <p className="m-0 text-xs text-muted">주장하고, 설득하고, 거래하세요. 거짓말도 됩니다. 메모·캡처는 금지입니다.</p>
          {v.phase === 'whisper' && me && q && (
            <>
              <p className="m-0 text-sm text-muted">빠른 주장 — “{qName}”</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[...v.players.map((p) => p.color as string), 'grey'].map((c) => (
                  <button key={c} type="button" className="hs-choice" disabled={!canTalk} onClick={() => onAct({ type: 'say', text: assertText(c), assert: c })}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Dot c={c} />
                      <span className="truncate">{c === me.color ? '내 땅이었어' : c === 'grey' ? '아무도 없었어' : nameOf(v.players.findIndex((p) => p.color === c))}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          <form className="flex gap-2" onSubmit={send}>
            <input
              className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3"
              aria-label="할 말"
              value={text}
              maxLength={TEXT_MAX}
              enterKeyHint="send"
              autoComplete="off"
              disabled={!canTalk}
              placeholder={canTalk ? '주장하고, 설득하고, 거래하세요' : '지금은 말할 수 없습니다'}
              onChange={(e) => setText(e.target.value)}
            />
            <Button tone="primary" type="submit" disabled={!canTalk || !text.trim()}>
              말하기
            </Button>
          </form>
          {chat.length > 0 ? chatList : <p className="m-0 text-sm text-muted">아직 들리는 말이 없습니다.</p>}
        </div>
      </Sheet>

      <Sheet
        open={menu}
        title="메뉴"
        onClose={() => {
          setMenu(false)
          setRules(false)
        }}
      >
        <div className="flex flex-col gap-2 pb-2">
          {local && !over && <Button
              onClick={() => {
                local.setPaused(!local.paused)
                setMenu(false)
              }}
            >{local.paused ? '▶ 계속' : '❚❚ 일시정지 · 시간이 멈춥니다'}</Button>}
          <Button onClick={() => setRules(!rules)}>{rules ? '규칙 요약 닫기' : '📖 규칙 요약'}</Button>
          {rules && <RulesText />}
          <p className="m-0 text-xs text-muted">지난 계절의 기록과 지난 말은 남기지 않습니다. 기억만이 증거입니다.</p>
          <Button onClick={onLeave}>{local ? '⌂ 처음으로 · 이 게임은 끝난다' : '⌂ 나가기 · 자리는 봇이 이어받는다'}</Button>
        </div>
      </Sheet>

      <Sheet open={resultOpen} title="결과" onClose={() => setResultOpen(false)}>
        {over && (
          <div className="flex flex-col gap-2 pb-2">
            <p className="m-0 text-xl font-extrabold">
              {winners.size > 1 ? '함께 승리: ' : ''}
              {[...winners].map((i) => (me?.index === i ? '나' : nameOf(i))).join(', ')}
              {winners.size === 1 ? ' 승리' : ''}
            </p>
            <ResultList
              rows={ranked.map((p) => ({
                id: p.i,
                name: me?.index === p.i && p.name !== '나' ? `${p.name} (나)` : p.name,
                score: p.score,
                detail: `${HOUSE_NAME[p.color]} · 기록 표지 ${p.marks}개${p.isBot ? ` · 봇 ${PERSONA[p.persona ?? ''] ?? ''}` : ''}`,
                winner: winners.has(p.i),
              }))}
            />
            <p className="m-0 text-sm text-muted">마을의 공식 역사가 완성되었습니다. 실제로 무슨 일이 있었는지는 아무도 모릅니다.</p>
            {local && (
              <Button tone="primary" onClick={local.again}>
                같은 구성으로 다시
              </Button>
            )}
            <Button onClick={onLeave}>처음으로</Button>
          </div>
        )}
      </Sheet>
    </>
  )
}

interface RowProps {
  row: View['board'][number]
  v: View
  recall: boolean
  askable: number[]
  feud: boolean
  picked: number | null
  onAsk(season: number): void
}

function BoardRow({ row, v, recall, askable, feud, picked, onAsk }: RowProps) {
  return (
    <>
      <div className={`hs-plot ${recall ? 'recall' : ''}`}>
        <span className="truncate">{row.name}</span>
        <b>{row.value}</b>
      </div>
      {row.cells.map((c, k) => {
        const s = k + 1
        const cls = ['hs-cell']
        if (c.forgotten) cls.push('forgotten')
        else if (s > v.season) cls.push('future')
        const can = askable.includes(s)
        if (can) cls.push('askable')
        if (picked === s) cls.push('picked')
        if (v.question && v.question.plot === row.id && v.question.season === s) cls.push('questioned')
        if (feud && s === v.season) cls.push('feud')
        const fading = v.phase === 'claimResult' && s === v.season - 1
        const label = `${s}계절 ${row.name}${c.tile ? `, ${HOUSE_NAME[c.tile]} 땅` : ''}${c.chron ? `, 공식 역사 ${HOUSE_NAME[c.chron]}` : ''}${c.forgotten ? ', 망각됨' : ''}`
        const inner = c.tile ? (
          <span className={`hs-tile ${c.tile === 'black' ? 'black' : ''} ${fading ? 'fadeout' : ''}`} style={{ background: colorVar(c.tile) }} />
        ) : c.chron ? (
          <span className="hs-ring" style={{ borderColor: colorVar(c.chron === 'black' ? 'black-ring' : c.chron) }} />
        ) : feud && s === v.season ? (
          <span className="hs-feud" aria-hidden="true">
            ✕
          </span>
        ) : null
        return can ? (
          <button key={s} type="button" className={cls.join(' ')} aria-label={`${label} 질문하기`} aria-pressed={picked === s} onClick={() => onAsk(s)}>
            {inner}
          </button>
        ) : (
          <div key={s} className={cls.join(' ')} title={label}>
            {inner}
          </div>
        )
      })}
    </>
  )
}
