import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom } from '@gamehub/net/client'
import { HomeScreen, WaitingRoom } from '@gamehub/ui'
import { useState } from 'react'
import { def } from '../def'
import type { Action, State, View } from '../engine/game'
import { Table } from './Table'

type Local = LocalGame<State, Action, View, unknown>
const TITLE = '마왕의 패'

export function App() {
  const [online, client] = useRoom<View, Action>({ slug: def.slug })
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
        title={TITLE}
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
      title={TITLE}
      tagline="함께 성장해 마왕성으로. 그러나 가장 빛나는 자가 검은 왕관을 쓴다."
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
