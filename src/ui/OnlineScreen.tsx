import { useState } from 'react'
import { MAX_PLAYERS, MIN_PLAYERS, type LawId } from '../engine'
import type { OnlineApi } from '../app/online'
import type { Seat, Session } from '../app/session'
import { seatColor } from './colors'
import { buzz } from './fx'
import { LawSelect } from './HomeScreen'
import { Avatar, Button, Panel, Screen, Segmented, TopBar } from './primitives'

interface OnlineScreenProps {
  online: OnlineApi
  onBack: () => void
  onJoined: (session: Session) => void
}

const inputCls =
  'min-h-12 w-full min-w-0 rounded-xl bg-void/60 px-4 text-[15px] font-bold text-fg ring-1 ring-line ring-inset placeholder:text-muted/50 focus:ring-accent focus:outline-none'

/** 온라인 대전 (로드맵 8단계): 방 만들기 / 코드로 들어가기 / 대기실 */
export function OnlineScreen({ online, onBack, onJoined }: OnlineScreenProps) {
  const [name, setName] = useState('나')
  const [code, setCode] = useState('')
  const [count, setCount] = useState(2)
  const [kinds, setKinds] = useState<Seat['kind'][]>(['human', 'human', 'bot', 'bot'])
  const [law, setLaw] = useState<LawId | 'random'>('random')
  const [copied, setCopied] = useState(false)
  const joined = online.joined

  const errorBox = online.error && (
    <p role="alert" className="animate-shake rounded-2xl bg-[#3a1d27] px-4 py-3 text-center text-sm font-bold text-[#ffb3b3] ring-1 ring-danger/50">
      {online.error}
    </p>
  )

  if (joined) {
    const waiting = online.claimed.filter((c) => !c).length
    const share = async () => {
      buzz(10)
      const text = `테서랙트 방 코드: ${joined.room}`
      try {
        if (navigator.share) await navigator.share({ title: '테서랙트', text, url: location.origin })
        else {
          await navigator.clipboard.writeText(joined.room ?? '')
          setCopied(true)
        }
      } catch {
        // 공유를 취소한 경우
      }
    }
    return (
      <Screen>
        <TopBar
          left={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                online.leave()
                onBack()
              }}
            >
              나가기
            </Button>
          }
          title="대기실"
        />
        <div className="flex animate-rise flex-col items-center gap-2 pt-4 text-center">
          <p className="text-sm text-muted">친구에게 방 코드를 알려 주세요</p>
          <p className="flex gap-1.5" aria-label={`방 코드 ${joined.room}`}>
            {[...(joined.room ?? '')].map((ch, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="flex h-16 w-12 animate-drop items-center justify-center rounded-2xl bg-raised font-display text-3xl font-bold text-accent ring-1 ring-accent/40 ring-inset"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {ch}
              </span>
            ))}
          </p>
          <Button size="sm" onClick={share}>
            {copied ? '✓ 복사했어요' : '공유 · 복사'}
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {joined.seats.map((s, i) => {
            const here = s.kind === 'bot' || online.claimed[i]
            return (
              <li key={i} className="flex animate-rise items-center gap-3 rounded-2xl bg-surface/80 p-3 ring-1 ring-line ring-inset" style={{ animationDelay: `${i * 60}ms` }}>
                <Avatar name={s.name} color={seatColor(i)} size={36} glow={!!joined.localSeats?.includes(i)} />
                <span className="flex-1 font-bold">
                  {s.name}
                  {joined.localSeats?.includes(i) && <span className="ml-1 text-xs text-accent">(나)</span>}
                </span>
                <span className={`flex items-center gap-1.5 text-xs font-bold ${here ? 'text-good' : 'text-muted'}`}>
                  <span className={`size-2 rounded-full ${here ? 'bg-good' : 'animate-pulse bg-muted'}`} aria-hidden="true" />
                  {s.kind === 'bot' ? '봇' : here ? '들어옴' : '기다리는 중'}
                </span>
              </li>
            )
          })}
        </ul>
        <Button variant="primary" size="lg" block onClick={() => onJoined(joined)}>
          {waiting > 0 ? `게임 화면으로 (${waiting}명 기다리는 중)` : '게임 시작'}
        </Button>
        {errorBox}
      </Screen>
    )
  }

  const busy = online.status === 'connecting'
  return (
    <Screen>
      <TopBar
        left={
          <Button variant="ghost" size="sm" onClick={onBack}>
            뒤로
          </Button>
        }
        title="온라인 대전"
      />

      <label className="flex animate-rise flex-col gap-1.5">
        <span className="text-xs font-bold text-muted">내 이름</span>
        <input className={inputCls} value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
      </label>

      <Panel title="방 코드로 들어가기" className="animate-rise [animation-delay:60ms]">
        <div className="flex gap-2">
          <input
            className={`${inputCls} text-center font-display text-2xl tracking-[0.4em] uppercase`}
            aria-label="방 코드"
            placeholder="ABCDE"
            value={code}
            maxLength={5}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button variant="primary" disabled={code.trim().length !== 5 || busy} onClick={() => online.join(code, name)}>
            입장
          </Button>
        </div>
      </Panel>

      <Panel title="방 만들기" className="animate-rise [animation-delay:120ms]">
        <div className="flex flex-col gap-3">
          <Segmented
            label="인원"
            value={count}
            onChange={setCount}
            options={Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => ({ value: i + MIN_PLAYERS, label: `${i + MIN_PLAYERS}인` }))}
          />
          {kinds.slice(1, count).map((k, j) => (
            <div className="flex items-center gap-3" key={j}>
              <Avatar name={String(j + 2)} color={seatColor(j + 1)} size={32} />
              <span className="flex-1 text-sm font-bold">{j + 2}번 자리</span>
              <div className="w-[128px]">
                <Segmented
                  label={`${j + 2}번 자리 종류`}
                  value={k}
                  onChange={(kind) => setKinds(kinds.map((x, i) => (i === j + 1 ? kind : x)))}
                  options={[
                    { value: 'human', label: '친구' },
                    { value: 'bot', label: '봇' },
                  ]}
                />
              </div>
            </div>
          ))}
          <LawSelect value={law} onChange={setLaw} />
          <Button
            variant="primary"
            size="lg"
            block
            disabled={busy}
            onClick={() =>
              online.create(
                kinds.slice(0, count).map((kind, i) => ({
                  kind: i === 0 ? 'human' : kind,
                  name: i === 0 ? name.trim() || '방장' : kind === 'bot' ? `봇 ${i + 1}` : `친구 ${i + 1}`,
                })),
                law,
              )
            }
          >
            방 만들기
          </Button>
        </div>
      </Panel>

      {busy && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted">
          <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
          서버에 연결하는 중…
        </p>
      )}
      {errorBox}
    </Screen>
  )
}
