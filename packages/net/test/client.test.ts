import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invitedCode } from '../src/client/hooks'
import { LocalGame } from '../src/client/local'
import { RoomClient, socketUrl, type SocketLike } from '../src/client/room'
import type { ClientMessage, ServerMessage } from '../src/core/protocol'
import { countGame, fakeTimers } from './fixtures'

class FakeSocket {
  readyState = 0
  readonly sent: ClientMessage[] = []
  onopen: ((e: never) => void) | null = null
  onclose: ((e: never) => void) | null = null
  onmessage: ((e: never) => void) | null = null
  send(data: string) {
    this.sent.push(JSON.parse(data) as ClientMessage)
  }
  close() {
    this.readyState = 3
  }
  open() {
    this.readyState = 1
    this.onopen?.(undefined as never)
  }
  drop() {
    this.readyState = 3
    this.onclose?.(undefined as never)
  }
  receive(msg: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(msg) } as never)
  }
}

function setup(saved?: string) {
  const store = new Map<string, string>(saved ? [['count:session', saved]] : [])
  const sockets: FakeSocket[] = []
  const client = new RoomClient({
    slug: 'count',
    url: 'ws://x/ws',
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
    socket: () => {
      const s = new FakeSocket()
      sockets.push(s)
      return s as unknown as SocketLike
    },
  })
  return { client, sockets, store }
}

describe('RoomClient', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('주소는 현재 페이지 디렉터리 기준이다', () => {
    expect(socketUrl('http://host/count/?room=AB12')).toBe('ws://host/count/ws')
    expect(socketUrl('https://host/')).toBe('wss://host/ws')
    expect(invitedCode('?room=ab12')).toBe('AB12')
    expect(invitedCode('')).toBeNull()
  })

  it('자리를 얻으면 저장하고, 끊기면 resume 으로 다시 붙는다', () => {
    const { client, sockets, store } = setup()
    client.create('가람', 2)
    sockets[0]!.open()
    expect(sockets[0]!.sent[0]).toMatchObject({ t: 'create', seats: 2 })
    sockets[0]!.receive({ t: 'joined', code: 'AB12', token: 'tk', seat: 0 })
    expect(JSON.parse(store.get('count:session')!)).toEqual({ code: 'AB12', token: 'tk' })
    sockets[0]!.drop()
    expect(client.getState().connection).toBe('reconnecting')
    vi.advanceTimersByTime(500)
    sockets[1]!.open()
    expect(sockets[1]!.sent).toEqual([{ t: 'resume', code: 'AB12', token: 'tk' }])
  })

  it('방이 사라졌으면 저장한 자리를 버리고 다시 붙지 않는다', () => {
    const { client, sockets, store } = setup('{"code":"AB12","token":"tk"}')
    expect(client.resume()).toBe(true)
    sockets[0]!.open()
    sockets[0]!.receive({ t: 'error', reason: 'no-room', message: '없는 방입니다.' })
    expect(store.has('count:session')).toBe(false)
    expect(client.getState()).toMatchObject({ connection: 'idle', error: '없는 방입니다.' })
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(1)
  })

  it('refresh 는 새 소켓으로 다시 접속하고, dispose 는 자리를 남긴다', () => {
    const { client, sockets, store } = setup('{"code":"AB12","token":"tk"}')
    client.resume()
    sockets[0]!.open()
    client.refresh()
    expect(sockets).toHaveLength(2)
    sockets[1]!.open()
    expect(sockets[1]!.sent[0]).toMatchObject({ t: 'resume' })
    client.dispose()
    expect(store.has('count:session')).toBe(true)
    client.refresh()
    expect(sockets).toHaveLength(2)
  })

  it('나가면 저장한 자리를 지운다', () => {
    const { client, sockets, store } = setup('{"code":"AB12","token":"tk"}')
    client.resume()
    sockets[0]!.open()
    client.leave()
    sockets[0]!.receive({ t: 'left' })
    expect(store.has('count:session')).toBe(false)
    expect(client.getState().connection).toBe('idle')
  })
})

describe('LocalGame', () => {
  const seats = [
    { kind: 'human' as const, name: '가람' },
    { kind: 'bot' as const, name: '' },
  ]

  it('사람과 봇이 번갈아 두고, 저장한 판을 이어간다', () => {
    const t = fakeTimers()
    const saves: unknown[] = []
    const game = new LocalGame(countGame, { seats, seed: 7, timers: t.timers, onSave: (s) => saves.push(s) })
    game.start()
    game.act({ n: 2 })
    expect(game.getState().room).toMatchObject({ you: 0, actors: [1] })
    game.act({ n: 1 })
    expect(game.getState().error).toMatch(/차례/)
    t.next()
    expect(game.getState().room.view).toMatchObject({ total: 3 })
    expect(saves).toHaveLength(2)

    const resumed = new LocalGame(countGame, { ...game.save(), options: undefined, timers: fakeTimers().timers })
    expect(resumed.getState().room.view).toMatchObject({ total: 3, turn: 0 })
    expect(resumed.getState().room.log).toHaveLength(2)
  })

  it('돌려 하기에서는 둘 차례인 사람의 화면이 된다', () => {
    const game = new LocalGame(countGame, {
      seats: [
        { kind: 'human', name: '가' },
        { kind: 'human', name: '나' },
      ],
      timers: fakeTimers().timers,
    })
    expect(game.getState().room.you).toBe(0)
    game.act({ n: 1 })
    expect(game.getState().room.you).toBe(1)
  })

  it('멈추면 봇이 두지 않는다', () => {
    const t = fakeTimers()
    const game = new LocalGame(countGame, { seats, timers: t.timers })
    game.act({ n: 1 })
    game.setPaused(true)
    expect(t.queue).toHaveLength(0)
    game.setPaused(false)
    expect(t.queue).toHaveLength(1)
    game.dispose()
    expect(t.queue).toHaveLength(0)
  })
})
