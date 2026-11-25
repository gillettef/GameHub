import { NAME_MAX, type SeatInfo } from '@gamehub/net'
import { useState, type ReactNode } from 'react'
import { Button } from './Button'
import { LobbyLink, Screen } from './Screen'
import { defaultSeats, namedSeats, resizeSeats, toggleSeat } from './seats'

export interface HomeScreenProps {
  /** 저장 키 접두어 */
  slug: string
  title: string
  tagline?: ReactNode
  minSeats: number
  maxSeats: number
  /** 봇이 있는 게임인지 */
  bots: boolean
  /** 초대 링크로 들어온 방 코드 */
  invited?: string | null
  error?: string | null
  connecting?: boolean
  onLocal(seats: SeatInfo[]): void
  onCreate(name: string, seats: number, botSeats: number[]): void
  onJoin(code: string, name: string): void
  onWatch(code: string): void
  /** 이어하기, 규칙 보기 같은 게임별 버튼 */
  children?: ReactNode
}

export function HomeScreen(p: HomeScreenProps) {
  const nameKey = `${p.slug}:name`
  const [name, setName] = useState(() => localStorage.getItem(nameKey) ?? '')
  const [mode, setMode] = useState<'local' | 'online'>(p.invited ? 'online' : 'local')
  const [code, setCode] = useState(p.invited ?? '')
  // 한 기기는 나머지 자리가 봇, 온라인은 친구가 들어올 빈자리가 기본이다
  const [seats, setSeats] = useState<SeatInfo[]>(() => defaultSeats(p.minSeats, p.bots, ''))
  const [onlineBots, setOnlineBots] = useState<number[]>([])

  const rename = (value: string) => {
    setName(value)
    localStorage.setItem(nameKey, value)
  }
  const counts = Array.from({ length: p.maxSeats - p.minSeats + 1 }, (_, i) => p.minSeats + i)
  const isBot = (i: number) => (mode === 'local' ? seats[i]?.kind === 'bot' : onlineBots.includes(i))
  const toggle = (i: number) => {
    if (mode === 'local') setSeats((all) => toggleSeat(all, i))
    else setOnlineBots((all) => (all.includes(i) ? all.filter((x) => x !== i) : [...all, i]))
  }
  const ready = code.trim().length === 4

  return (
    <Screen
      footer={
        mode === 'local' ? (
          <Button tone="primary" onClick={() => p.onLocal(namedSeats(seats, name))}>
            시작
          </Button>
        ) : code ? (
          <>
            <Button tone="primary" disabled={!ready || p.connecting} onClick={() => p.onJoin(code, name)}>
              {p.connecting ? '접속 중…' : '참가'}
            </Button>
            <Button tone="ghost" disabled={!ready || p.connecting} onClick={() => p.onWatch(code)}>
              관전
            </Button>
          </>
        ) : (
          <Button tone="primary" disabled={p.connecting} onClick={() => p.onCreate(name, seats.length, onlineBots.filter((i) => i < seats.length))}>
            {p.connecting ? '접속 중…' : '방 만들기'}
          </Button>
        )
      }
    >
      <LobbyLink />
      <h1 className="mt-1 mb-1 text-3xl font-extrabold">{p.title}</h1>
      {p.tagline != null && <p className="mt-0 text-muted">{p.tagline}</p>}

      <div className="my-3 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
        {(['local', 'online'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            className={`min-h-11 rounded-lg ${mode === m ? 'bg-raised font-bold' : 'text-muted'}`}
            onClick={() => setMode(m)}
          >
            {m === 'local' ? '한 기기' : '온라인'}
          </button>
        ))}
      </div>

      <label className="mb-3 block">
        <span className="mb-1 block text-sm text-muted">닉네임</span>
        <input
          className="h-12 w-full rounded-xl border border-line bg-surface px-3"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          placeholder="이름"
          onChange={(e) => rename(e.target.value)}
        />
      </label>

      {mode === 'online' && (
        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-muted">방 코드 (비우면 새 방)</span>
          <input
            className="h-12 w-full rounded-xl border border-line bg-surface px-3 tracking-[0.3em] uppercase"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
          />
        </label>
      )}

      {(mode === 'local' || !code) && (
        <>
          {counts.length > 1 && (
            <div className="mb-3">
              <span className="mb-1 block text-sm text-muted">인원</span>
              <div className="flex gap-1.5">
                {counts.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={seats.length === n}
                    className={`min-h-11 flex-1 rounded-lg border-2 bg-surface ${seats.length === n ? 'border-primary font-bold' : 'border-transparent'}`}
                    onClick={() => setSeats((s) => resizeSeats(s, n, p.bots))}
                  >
                    {n}명
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="m-0 mb-3 list-none p-0">
            {seats.map((_, i) => (
              <li key={i} className="flex min-h-12 items-center justify-between gap-2 border-b border-line">
                <span>
                  {i + 1}번 자리{mode === 'online' && i === 0 ? ' · 나' : ''}
                </span>
                {mode === 'online' && i === 0 ? null : p.bots ? (
                  <button type="button" className="min-h-11 min-w-24 rounded-lg bg-raised px-3 text-sm" onClick={() => toggle(i)}>
                    {isBot(i) ? '봇' : mode === 'online' ? '친구' : '사람'}
                  </button>
                ) : (
                  <span className="text-sm text-muted">{mode === 'online' ? '친구' : '사람'}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {p.error && (
        <p role="alert" className="text-danger">
          {p.error}
        </p>
      )}
      <div className="flex flex-col gap-2">{p.children}</div>
    </Screen>
  )
}
