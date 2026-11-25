import type { RoomSnapshot } from '@gamehub/net'
import { BoardViewport, Button, GameShell, LogList, PlayerStrip, ResultList, Sheet } from '@gamehub/ui'
import { useState } from 'react'
import type { Action } from '../def'
import { START, legalTakes, type State } from '../engine/stones'

const COLORS = ['#e5646e', '#5aa9e6', '#7bc96f', '#c792ea']

export function Table({ room, error, onAct, onLeave }: { room: RoomSnapshot<State>; error: string | null; onAct(a: Action): void; onLeave(): void }) {
  const [menu, setMenu] = useState(false)
  const view = room.view!
  const mine = room.status === 'playing' && room.you !== null && room.actors.includes(room.you)
  const turnName = room.seats[view.turn]?.name ?? ''
  const over = view.winner !== null

  return (
    <>
      <GameShell
        status={over ? `${room.seats[view.winner!]!.name} 승리` : mine ? '내 차례: 몇 개 가져갈까요?' : `${turnName} 차례`}
        detail={`남은 돌 ${view.stones}개`}
        onMenu={() => setMenu(true)}
        notice={error}
        players={
          <PlayerStrip
            players={room.seats.map((s, i) => ({
              id: i,
              name: s.name,
              color: COLORS[i]!,
              detail: s.kind === 'bot' ? '봇' : undefined,
              active: room.actors.includes(i),
              you: i === room.you,
              offline: !s.online,
            }))}
          />
        }
        actions={
          over ? (
            <Button tone="primary" onClick={onLeave}>
              처음으로
            </Button>
          ) : (
            legalTakes(view).map((n) => (
              <Button key={n} tone="primary" disabled={!mine} onClick={() => onAct({ take: n })}>
                {n}개
              </Button>
            ))
          )
        }
      >
        {over ? (
          <div className="h-full overflow-y-auto p-4">
            <ResultList
              rows={room.seats
                .map((s, i) => ({ id: i, name: s.name, score: i === view.winner ? '★' : '', winner: i === view.winner }))
                .sort((a, b) => Number(b.winner) - Number(a.winner))}
            />
          </div>
        ) : (
          <BoardViewport>
            <ul className="m-0 grid w-full max-w-80 list-none grid-cols-7 gap-2 p-0" aria-label={`돌 ${view.stones}개`}>
              {Array.from({ length: START }, (_, i) => (
                <li key={i} className={`aspect-square rounded-full ${i < view.stones ? 'bg-primary' : 'bg-surface'}`} />
              ))}
            </ul>
          </BoardViewport>
        )}
      </GameShell>
      <Sheet open={menu} title="메뉴" onClose={() => setMenu(false)}>
        <h3 className="mt-0 text-sm text-muted">기록</h3>
        <LogList entries={room.log} />
        <Button tone="danger" className="mt-4 w-full" onClick={onLeave}>
          나가기
        </Button>
      </Sheet>
    </>
  )
}
