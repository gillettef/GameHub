import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom } from '@gamehub/net/client'
import { HomeScreen, WaitingRoom } from '@gamehub/ui'
import { useState } from 'react'
import { def, type Action } from '../def'
import type { State } from '../engine/stones'
import { Table } from './Table'

type Local = LocalGame<State, Action, State, unknown>

export function App() {
  const [online, client] = useRoom<State, Action>({ slug: def.slug })
  const [local, setLocal] = useState<{ key: number; game: Local } | null>(null)
  const [invited, setInvited] = useState(() => invitedCode(location.search))

  const clearInvite = () => {
    setInvited(null)
    history.replaceState(null, '', location.pathname)
  }
  const leaveOnline = () => {
    client.leave()
    clearInvite()
  }
  const startLocal = (seats: SeatInfo[]) => setLocal((l) => ({ key: (l?.key ?? 0) + 1, game: new LocalGame(def, { seats }) }))

  const room = online.room
  if (room?.status === 'lobby') {
    return (
      <WaitingRoom
        title="마지막 돌"
        room={room}
        bots
        error={online.error}
        onSeat={(i, kind) => client.setSeat(i, kind)}
        onStart={() => client.start()}
        onLeave={leaveOnline}
      />
    )
  }
  if (room) {
    return (
      <Table
        room={room}
        error={online.connection === 'reconnecting' ? '다시 접속하는 중입니다…' : online.error}
        onAct={(a) => client.act(a)}
        onLeave={leaveOnline}
      />
    )
  }
  if (local) return <LocalTable key={local.key} game={local.game} onLeave={() => setLocal(null)} />
  return (
    <HomeScreen
      slug={def.slug}
      title="마지막 돌"
      tagline="1~3개씩 가져가 마지막 돌을 차지하세요."
      minSeats={def.minSeats}
      maxSeats={def.maxSeats}
      bots
      invited={invited}
      error={online.error}
      connecting={online.connection !== 'idle'}
      onLocal={startLocal}
      onCreate={(name, seats, bots) => client.create(name, seats, bots)}
      onJoin={(code, name) => client.join(code, name)}
      onWatch={(code) => client.watch(code)}
    />
  )
}

function LocalTable({ game, onLeave }: { game: Local; onLeave(): void }) {
  const state = useLocalGame(game)
  return <Table room={state.room} error={state.error} onAct={(a) => game.act(a)} onLeave={onLeave} />
}
