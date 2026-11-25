import type { RoomSnapshot } from '@gamehub/net'
import { useState } from 'react'
import { Button } from './Button'
import { Screen } from './Screen'
import { inviteLink } from './seats'
import { shareLink } from './share'

export interface WaitingRoomProps {
  title: string
  room: RoomSnapshot
  bots: boolean
  error?: string | null
  onSeat(seat: number, kind: 'bot' | 'open'): void
  onStart(): void
  onLeave(): void
}

export function WaitingRoom({ title, room, bots, error, onSeat, onStart, onLeave }: WaitingRoomProps) {
  const [shared, setShared] = useState<string | null>(null)
  const code = room.code ?? ''
  const link = inviteLink(location.href, code)
  const host = room.you === room.host
  const open = room.seats.filter((s) => s.kind === 'open').length

  const invite = async () => {
    const result = await shareLink(link, title)
    setShared(result === 'copied' ? '초대 링크를 복사했습니다.' : result === 'manual' ? '아래 주소를 길게 눌러 복사하세요.' : null)
  }

  return (
    <Screen
      footer={
        <>
          {host ? (
            <Button tone="primary" disabled={!bots && open > 0} onClick={onStart}>
              {open > 0 && bots ? `시작 (빈자리 ${open}곳은 봇)` : '시작'}
            </Button>
          ) : (
            <p className="m-0 text-center text-muted">{room.you === null ? '관전 중입니다.' : '방장이 시작하기를 기다리는 중입니다.'}</p>
          )}
          <Button tone="ghost" onClick={onLeave}>
            나가기
          </Button>
        </>
      }
    >
      <p className="mb-0 text-muted">{title} · 방 코드</p>
      <p className="my-1 text-5xl font-extrabold tracking-[0.2em]" data-testid="room-code">
        {code}
      </p>
      <Button className="w-full" onClick={invite}>
        초대 링크 보내기
      </Button>
      {shared && <p className="text-sm text-muted">{shared}</p>}
      <p className="text-xs break-all text-muted select-all">{link}</p>

      <ul className="m-0 list-none p-0">
        {room.seats.map((s, i) => (
          <li key={i} className="flex min-h-14 items-center justify-between gap-2 border-b border-line">
            <span className="min-w-0 truncate">
              {s.kind === 'open' ? <span className="text-muted">빈자리</span> : s.name}
              {i === room.host && <span className="ml-2 text-xs text-primary">방장</span>}
              {i === room.you && <span className="ml-2 text-xs text-muted">나</span>}
              {!s.online && s.kind === 'human' && <span className="ml-2 text-xs text-danger">끊김</span>}
            </span>
            {host && i !== room.host && (s.kind !== 'human' ? bots : !s.online) && (
              <button type="button" className="min-h-11 shrink-0 rounded-lg bg-raised px-3 text-sm" onClick={() => onSeat(i, s.kind === 'open' ? 'bot' : 'open')}>
                {s.kind === 'open' ? '봇 앉히기' : '비우기'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </Screen>
  )
}
