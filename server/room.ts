/**
 * 온라인 방 (로드맵 8단계). 순수 로직이라 테스트할 수 있다.
 * 행동 기록의 원본을 갖고, 들어온 행동을 엔진으로 검증해 붙인 뒤 봇 차례를 진행한다.
 */
import { chooseBotAction } from '../src/bot/bot'
import { applyAction, createGame, IllegalActionError, type Action, type GameState, type LawId } from '../src/engine'
import type { RoomSnapshot } from '../src/app/protocol'
import type { Seat } from '../src/app/session'

export interface Room {
  code: string
  id: string
  createdAt: number
  seats: Seat[]
  /** 자리를 맡은 기기의 토큰. 봇 자리와 빈 자리는 null */
  owners: (string | null)[]
  actions: Action[]
  state: GameState
  config: GameState['config']
}

export class RoomError extends Error {}

export function createRoom(
  code: string,
  id: string,
  createdAt: number,
  seed: number,
  seats: Seat[],
  law: LawId | 'random',
  hostToken: string,
): Room {
  if (seats.length < 2 || seats.length > 4) throw new RoomError('인원은 2~4명입니다.')
  if (seats[0]?.kind !== 'human') throw new RoomError('방장 자리는 사람이어야 합니다.')
  const config = { playerCount: seats.length, seed, ...(law === 'random' ? {} : { law }) }
  const room: Room = {
    code,
    id,
    createdAt,
    seats: seats.map((s) => ({ ...s })),
    owners: seats.map((_, i) => (i === 0 ? hostToken : null)),
    actions: [],
    state: createGame(config),
    config,
  }
  return runBots(room)
}

export function seatsOf(room: Room, token: string): number[] {
  return room.owners.flatMap((o, i) => (o === token ? [i] : []))
}

export function claimed(room: Room): boolean[] {
  return room.seats.map((s, i) => s.kind === 'bot' || room.owners[i] !== null)
}

/** 자리별 접속 여부: 봇 자리는 늘 true, 사람 자리는 맡은 기기가 지금 연결돼 있으면 true */
export function onlineSeats(room: Room, connected: ReadonlySet<string>): boolean[] {
  return room.seats.map((s, i) => {
    const owner = room.owners[i]
    return s.kind === 'bot' || (!!owner && connected.has(owner))
  })
}

/** 방에 들어가기: 이미 맡은 자리가 있으면 그대로, 없으면 빈 사람 자리 하나를 맡는다 */
export function joinRoom(room: Room, token: string, name: string): number[] {
  const mine = seatsOf(room, token)
  if (mine.length > 0) return mine
  const free = room.seats.findIndex((s, i) => s.kind === 'human' && room.owners[i] === null)
  if (free === -1) throw new RoomError('빈 자리가 없습니다.')
  room.owners[free] = token
  const seat = room.seats[free] as Seat
  room.seats[free] = { ...seat, name: name.trim().slice(0, 12) || seat.name }
  return [free]
}

/**
 * 행동 하나를 받는다. index는 클라이언트가 알고 있는 기록 길이(어긋나면 거절).
 * @returns 이번에 기록에 붙은 행동들 (봇 행동 포함)
 */
export function submitAction(room: Room, token: string, index: number, action: Action): Action[] {
  if (index !== room.actions.length) throw new RoomError('기록이 어긋났습니다. 다시 접속해 주세요.')
  if (!seatsOf(room, token).includes(action.player)) throw new RoomError('내 자리의 행동이 아닙니다.')
  const before = room.actions.length
  try {
    room.state = applyAction(room.state, action)
  } catch (e) {
    throw new RoomError(e instanceof IllegalActionError ? e.message : '할 수 없는 행동입니다.')
  }
  room.actions.push(action)
  runBots(room)
  return room.actions.slice(before)
}

/** 봇 차례면 봇이 둘 수 없을 때까지 둔다 */
export function runBots(room: Room): Room {
  for (let guard = 0; guard < 500; guard++) {
    const s = room.state
    let bot: number | null = null
    if (s.phase.kind === 'setup') {
      bot = s.players.find((p) => p.personalGoal === null && room.seats[p.id]?.kind === 'bot')?.id ?? null
    } else if (s.phase.kind === 'round' && room.seats[s.currentPlayer]?.kind === 'bot') {
      bot = s.currentPlayer
    }
    if (bot === null) break
    const action = chooseBotAction(s, bot)
    if (!action) break
    room.state = applyAction(s, action)
    room.actions.push(action)
  }
  return room
}

export function snapshot(room: Room, connected: ReadonlySet<string>): RoomSnapshot {
  return {
    id: room.id,
    createdAt: room.createdAt,
    config: room.config,
    seats: room.seats,
    actions: room.actions,
    claimed: claimed(room),
    online: onlineSeats(room, connected),
  }
}
