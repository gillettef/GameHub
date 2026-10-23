import { useState } from 'react'
import { LAW_DECK, LAWS, MAX_PLAYERS, MIN_PLAYERS, type LawId } from '../engine'
import type { Seat } from '../app/session'
import { seatColor } from './colors'
import { Avatar, Button, Panel, Screen, Segmented } from './primitives'
import { RulesSheet } from './RulesSheet'
import { StorySheet } from './StorySheet'
import { TesseractLogo } from './TesseractLogo'

export interface NewGameOptions {
  seats: Seat[]
  law: LawId | 'random'
}

interface HomeScreenProps {
  canContinue: boolean
  onContinue: () => void
  onStart: (options: NewGameOptions) => void
  onHistory: () => void
  onOnline: () => void
}

const DEFAULT_NAMES = ['나', '설계자 2', '설계자 3', '설계자 4']
const SETUP_KEY = 'tesseract.setup'

interface SavedSetup {
  count: number
  seats: Seat[]
  law: LawId | 'random'
}

/** 마지막으로 시작한 새 게임 설정 (이름을 매번 다시 쓰지 않게) */
function loadSetup(): SavedSetup {
  const fallback: SavedSetup = { count: 2, seats: DEFAULT_NAMES.map((name, i) => ({ name, kind: i === 0 ? 'human' : 'bot' })), law: 'random' }
  try {
    const v = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null') as Partial<SavedSetup> | null
    if (!v || !Array.isArray(v.seats) || v.seats.length !== MAX_PLAYERS) return fallback
    const count = typeof v.count === 'number' && v.count >= MIN_PLAYERS && v.count <= MAX_PLAYERS ? v.count : fallback.count
    const law = v.law === 'random' || (typeof v.law === 'string' && v.law in LAWS) ? v.law : 'random'
    return { count, seats: v.seats.map((s, i) => ({ name: String(s?.name ?? DEFAULT_NAMES[i]).slice(0, 12), kind: s?.kind === 'bot' ? 'bot' : 'human' })), law }
  } catch {
    return fallback
  }
}

function saveSetup(v: SavedSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(v))
  } catch {
    // 저장할 수 없으면 넘어간다
  }
}

export function LawSelect({ value, onChange }: { value: LawId | 'random'; onChange: (v: LawId | 'random') => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-muted">우주 법칙</span>
      <span className="relative">
        <select
          className="min-h-12 w-full appearance-none rounded-xl bg-void/60 px-4 pr-10 text-[15px] font-bold text-fg ring-1 ring-line ring-inset focus:ring-accent"
          value={value}
          onChange={(e) => onChange(e.target.value as LawId | 'random')}
        >
          <option value="random">🎲 무작위로 뽑기</option>
          {LAW_DECK.map((id) => (
            <option key={id} value={id}>
              {LAWS[id].name}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted">
          ▾
        </span>
      </span>
      <span className="min-h-5 text-xs text-law/90">{value === 'random' ? '시작할 때 덱에서 1장을 뽑아요' : LAWS[value].text}</span>
    </label>
  )
}

export function HomeScreen({ canContinue, onContinue, onStart, onHistory, onOnline }: HomeScreenProps) {
  const [saved] = useState(loadSetup)
  const [count, setCount] = useState(saved.count)
  const [seats, setSeats] = useState<Seat[]>(saved.seats)
  const [law, setLaw] = useState<LawId | 'random'>(saved.law)
  const [rules, setRules] = useState(false)
  const [story, setStory] = useState(false)

  const update = (i: number, p: Partial<Seat>) => setSeats(seats.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const humans = seats.slice(0, count).filter((s) => s.kind === 'human').length

  return (
    <Screen className="pt-6">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <TesseractLogo size={150} />
        <h1 className="animate-rise bg-gradient-to-r from-[#d9d2ff] via-accent to-goal bg-clip-text font-display text-[40px] leading-none font-bold tracking-[0.18em] text-transparent">
          TESSERACT
        </h1>
        <p className="max-w-[300px] animate-rise text-sm leading-relaxed text-muted [animation-delay:80ms]">
          점에서 선으로, 선에서 면으로, 면에서 입체로, 그리고 시간으로.
        </p>
        <Button variant="ghost" size="sm" className="animate-rise [animation-delay:100ms]" onClick={() => setStory(true)}>
          ✦ 부서진 테서랙트 이야기
        </Button>
      </div>

      {canContinue && (
        <Button variant="primary" size="lg" block className="animate-rise [animation-delay:120ms]" onClick={onContinue}>
          ▶ 이어 하기
        </Button>
      )}

      <Panel title="새 게임 · 한 기기로 돌려 하기" className="animate-rise [animation-delay:160ms]">
        <div className="flex flex-col gap-4">
          <Segmented
            label="인원"
            value={count}
            onChange={setCount}
            options={Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => ({ value: i + MIN_PLAYERS, label: `${i + MIN_PLAYERS}인` }))}
          />

          <ul className="flex flex-col gap-2">
            {seats.slice(0, count).map((s, i) => (
              <li key={i} className="flex animate-rise items-center gap-2" style={{ animationDelay: `${i * 40}ms` }}>
                <Avatar name={s.name || '?'} color={seatColor(i)} size={36} />
                <input
                  className="min-h-12 min-w-0 flex-1 rounded-xl bg-void/60 px-3 text-[15px] font-bold text-fg ring-1 ring-line ring-inset placeholder:text-muted/60 focus:ring-accent focus:outline-none"
                  aria-label={`${i + 1}번 자리 이름`}
                  value={s.name}
                  maxLength={12}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <div className="w-[118px] shrink-0">
                  <Segmented
                    label={`${i + 1}번 자리 종류`}
                    value={s.kind}
                    onChange={(kind) => update(i, { kind })}
                    options={[
                      { value: 'human', label: '사람' },
                      { value: 'bot', label: '봇' },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>

          <LawSelect value={law} onChange={setLaw} />

          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              saveSetup({ count, seats, law })
              onStart({
                seats: seats.slice(0, count).map((s, i) => ({ ...s, name: s.name.trim() || DEFAULT_NAMES[i] || `${i + 1}번` })),
                law,
              })
            }}
          >
            게임 시작
          </Button>
          {humans > 1 && <p className="-mt-2 text-center text-xs text-muted">차례마다 기기를 넘겨요. 개인 목표는 가림막 뒤에서만 보여요.</p>}
        </div>
      </Panel>

      <div className="grid animate-rise grid-cols-3 gap-2 [animation-delay:220ms]">
        <Button onClick={onOnline} className="py-2">
          <span className="flex flex-col items-center gap-0.5">
            <span aria-hidden="true">🌐</span>
            <span className="text-xs">온라인 대전</span>
          </span>
        </Button>
        <Button onClick={() => setRules(true)} className="py-2">
          <span className="flex flex-col items-center gap-0.5">
            <span aria-hidden="true">📖</span>
            <span className="text-xs">규칙 보기</span>
          </span>
        </Button>
        <Button onClick={onHistory} className="py-2">
          <span className="flex flex-col items-center gap-0.5">
            <span aria-hidden="true">📊</span>
            <span className="text-xs">기록 · 통계</span>
          </span>
        </Button>
      </div>

      {rules && <RulesSheet onClose={() => setRules(false)} />}
      {story && <StorySheet onClose={() => setStory(false)} />}
    </Screen>
  )
}
