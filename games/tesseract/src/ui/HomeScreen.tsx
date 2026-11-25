// 처음 화면: 공통 HomeScreen(한 기기·온라인, 인원·자리) 위에 로고·이어 하기·우주 법칙·기록을 얹는다
import type { SeatInfo } from '@gamehub/net'
import { HomeScreen as CommonHome } from '@gamehub/ui'
import { useState } from 'react'
import { LAW_DECK, LAWS, MAX_PLAYERS, MIN_PLAYERS, type LawId } from '../engine'
import { Button } from './primitives'
import { RulesSheet } from './RulesSheet'
import { StorySheet } from './StorySheet'
import { TesseractLogo } from './TesseractLogo'
import { Icon } from './icons'

export type LawChoice = LawId | 'random'

interface HomeScreenProps {
  invited: string | null
  error: string | null
  connecting: boolean
  canContinue: boolean
  onContinue(): void
  onLocal(seats: SeatInfo[], law: LawChoice): void
  onCreate(name: string, seats: number, bots: number[], law: LawChoice): void
  onJoin(code: string, name: string): void
  onWatch(code: string): void
  onHistory(): void
}

const LAW_KEY = 'tesseract:law'

function loadLaw(): LawChoice {
  try {
    const v = localStorage.getItem(LAW_KEY)
    return v && Object.hasOwn(LAWS, v) ? (v as LawId) : 'random'
  } catch {
    return 'random'
  }
}

export function LawSelect({ value, onChange }: { value: LawChoice; onChange: (v: LawChoice) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">우주 법칙</span>
      <span className="relative">
        <select
          className="min-h-12 w-full appearance-none rounded-xl bg-surface px-4 pr-10 font-bold text-fg ring-1 ring-line ring-inset focus:ring-accent"
          value={value}
          onChange={(e) => onChange(e.target.value as LawChoice)}
        >
          <option value="random">무작위로 뽑기</option>
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

export function HomeScreen(p: HomeScreenProps) {
  const [law, setLawRaw] = useState<LawChoice>(loadLaw)
  const [rules, setRules] = useState(false)
  const [story, setStory] = useState(false)
  const setLaw = (v: LawChoice) => {
    setLawRaw(v)
    try {
      localStorage.setItem(LAW_KEY, v)
    } catch {
      // 저장할 수 없으면 이번 실행 동안만
    }
  }

  return (
    <>
      <CommonHome
        slug="tesseract"
        title="TESSERACT"
        minSeats={MIN_PLAYERS}
        maxSeats={MAX_PLAYERS}
        bots
        invited={p.invited}
        error={p.error}
        connecting={p.connecting}
        hero={
          <div className="flex flex-col items-center gap-2 pt-1 text-center">
            <TesseractLogo size={112} />
            <h1 className="m-0 bg-gradient-to-r from-[#d9d2ff] via-accent to-goal bg-clip-text font-display text-[36px] leading-none font-bold tracking-[0.18em] text-transparent">
              TESSERACT
            </h1>
            <p className="m-0 max-w-[300px] text-sm leading-relaxed text-muted">
              우주는 한때 하나였다. <b className="font-bold text-fg">흩어진 조각으로, 테서랙트를 다시 세워라.</b>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setStory(true)}>
              <Icon name="shards" size={16} /> 부서진 테서랙트 이야기
            </Button>
          </div>
        }
        top={
          p.canContinue ? (
            <Button variant="primary" size="lg" block onClick={p.onContinue}>
              <Icon name="play" size={16} /> 이어 하기
            </Button>
          ) : undefined
        }
        setup={<LawSelect value={law} onChange={setLaw} />}
        onLocal={(seats) => p.onLocal(seats, law)}
        onCreate={(name, seats, bots) => p.onCreate(name, seats, bots, law)}
        onJoin={p.onJoin}
        onWatch={p.onWatch}
      >
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setRules(true)}>
            <Icon name="codex" size={20} className="text-accent" /> 규칙 보기
          </Button>
          <Button onClick={p.onHistory}>
            <Icon name="stats" size={20} className="text-accent" /> 기록 · 통계
          </Button>
        </div>
      </CommonHome>
      {rules && <RulesSheet onClose={() => setRules(false)} />}
      {story && <StorySheet onClose={() => setStory(false)} />}
    </>
  )
}
