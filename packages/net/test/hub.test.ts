import { describe, expect, it } from 'vitest'
import { FakeConn, makeHub } from './fixtures'

describe('RoomHub 대기실', () => {
  it('방을 만들고 참가해 시작한다. 방장만 시작할 수 있다', () => {
    const { hub, host, guest } = makeHub()
    const a = host(2)
    const { code, token, seat } = a.joined
    expect(code).toMatch(/^[A-Z2-9]{4}$/)
    expect(seat).toBe(0)
    expect(token).toBeTruthy()
    const b = guest(code.toLowerCase())
    expect(b.joined.seat).toBe(1)
    expect(a.room.seats.map((s) => s.name)).toEqual(['가람', '나래'])
    const c = guest(code, '다온')
    expect(c.error?.reason).toBe('full')

    hub.receive(b, { t: 'start' })
    expect(b.error?.message).toMatch(/방장/)
    hub.receive(a, { t: 'start' })
    expect(a.room.status).toBe('playing')
    expect(a.room.view).toMatchObject({ total: 0, me: 0 })
    expect(b.room.view).toMatchObject({ me: 1 })
  })

  it('이름은 다듬고 인원은 검사한다', () => {
    const { hub } = makeHub()
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: '  <b>아주아주아주아주 긴 이름입니다</b>', seats: 2 })
    expect(a.room.seats[0]!.name).not.toMatch(/[<>]/)
    expect(a.room.seats[0]!.name.length).toBeLessThanOrEqual(12)
    const b = new FakeConn()
    hub.receive(b, { t: 'create', name: 'x', seats: 9 })
    expect(b.error?.reason).toBe('bad-request')
  })

  it('방장은 빈자리를 봇으로 바꾸고, 사람이 앉은 자리는 못 바꾼다', () => {
    const { hub, host, guest } = makeHub()
    const a = host(3)
    hub.receive(a, { t: 'seat', seat: 2, kind: 'bot' })
    expect(a.room.seats[2]!.kind).toBe('bot')
    guest(a.joined.code)
    hub.receive(a, { t: 'seat', seat: 1, kind: 'bot' })
    expect(a.error?.message).toMatch(/사람/)
    hub.receive(a, { t: 'seat', seat: 0, kind: 'open' })
    expect(a.error?.reason).toBe('bad-request')
  })

  it('방장이 나가면 남은 사람이 방장이 되고, 아무도 없으면 방이 사라진다', () => {
    const { hub, host, guest } = makeHub()
    const a = host(2)
    const b = guest(a.joined.code)
    hub.receive(a, { t: 'leave' })
    expect(a.sent.at(-1)).toEqual({ t: 'left' })
    expect(b.room.host).toBe(1)
    expect(b.room.seats[0]!.kind).toBe('open')
    hub.receive(b, { t: 'leave' })
    expect(hub.size).toBe(0)
  })

  it('이상한 입력은 오류로 답하고 죽지 않는다', () => {
    const { hub } = makeHub()
    const c = new FakeConn()
    for (const raw of [null, 3, 'x', [], {}, { t: 'nope' }, { t: 'act' }, { t: 'join', code: null }]) {
      hub.receive(c, raw)
      expect(c.sent.at(-1)?.t).toBe('error')
    }
  })
})

describe('RoomHub 진행', () => {
  it('빈자리는 시작할 때 봇이 되고 서버가 둔다', () => {
    const { hub, t, host } = makeHub()
    const a = host(3)
    hub.receive(a, { t: 'start' })
    expect(a.room.seats.map((s) => s.kind)).toEqual(['human', 'bot', 'bot'])
    hub.receive(a, { t: 'act', action: { n: 2 } })
    expect(t.queue).toHaveLength(1)
    t.flush()
    expect(a.room.view).toMatchObject({ total: 4, turn: 0 })
    expect(a.room.log.at(-1)!.text).toBe('봇 3: +1 (봇)')
  })

  it('내 차례가 아니거나 규칙에 어긋나면 거절한다', () => {
    const { hub, host, guest } = makeHub()
    const a = host(2)
    const b = guest(a.joined.code)
    hub.receive(a, { t: 'start' })
    hub.receive(b, { t: 'act', action: { n: 1 } })
    expect(b.error?.message).toMatch(/차례/)
    hub.receive(a, { t: 'act', action: { n: 5 } })
    expect(a.error?.message).toMatch(/1 또는 2/)
    hub.receive(a, { t: 'act', action: 'x' })
    expect(a.error?.reason).toBe('bad-request')
  })

  it('낡은 상태를 보고 보낸 행동(두 번 누름)은 거절한다', () => {
    const { hub, host } = makeHub()
    const a = host(2, [1])
    hub.receive(a, { t: 'start' })
    hub.receive(a, { t: 'act', action: { n: 1 }, version: 0 })
    expect(a.room.version).toBe(1)
    hub.receive(a, { t: 'act', action: { n: 1 }, version: 0 })
    expect(a.error?.reason).toBe('rejected')
    expect(a.room.view).toMatchObject({ total: 1 })
  })

  it('token 으로 자리를 되찾고, 틀린 token 과 없는 방은 구분해 알린다', () => {
    const { hub, host, guest } = makeHub()
    const a = host(2)
    const b = guest(a.joined.code)
    const { code, token } = b.joined
    hub.receive(a, { t: 'start' })
    hub.disconnect(b)
    expect(a.room.seats[1]!.online).toBe(false)
    const again = new FakeConn()
    hub.receive(again, { t: 'resume', code, token })
    expect(again.joined.seat).toBe(1)
    expect(a.room.seats[1]!.online).toBe(true)
    const bad = new FakeConn()
    hub.receive(bad, { t: 'resume', code, token: 'zzz' })
    expect(bad.error?.reason).toBe('bad-token')
    hub.receive(bad, { t: 'resume', code: 'ZZZZ', token })
    expect(bad.error?.reason).toBe('no-room')
  })

  it('관전자는 자리 없이 보기만 한다', () => {
    const { hub, host } = makeHub()
    const a = host(2, [1])
    hub.receive(a, { t: 'start' })
    const w = new FakeConn()
    hub.receive(w, { t: 'watch', code: a.joined.code })
    expect(w.joined.token).toBeNull()
    expect(w.room.you).toBeNull()
    hub.receive(w, { t: 'act', action: { n: 1 } })
    expect(w.error?.reason).toBe('rejected')
  })

  it('끊긴 사람의 차례는 정해진 시간 뒤 봇이 대신하고, 돌아오면 예약을 취소한다', () => {
    const { hub, t, host, guest } = makeHub({ awayMs: 45_000 })
    const a = host(2)
    const b = guest(a.joined.code)
    hub.receive(a, { t: 'start' })
    hub.receive(a, { t: 'act', action: { n: 1 } })
    hub.disconnect(b)
    expect(t.queue.map((q) => q.ms)).toEqual([45_000])
    const again = new FakeConn()
    hub.receive(again, { t: 'resume', code: b.joined.code, token: b.joined.token })
    expect(t.queue).toHaveLength(0)
    hub.disconnect(again)
    t.next()
    expect(a.room.view).toMatchObject({ total: 2, turn: 0 })
  })

  it('관전 접속이 오가도 대리 대기 시간이 처음으로 돌아가지 않는다', () => {
    const { hub, t, host, guest } = makeHub()
    const a = host(2)
    const b = guest(a.joined.code)
    hub.receive(a, { t: 'start' })
    hub.receive(a, { t: 'act', action: { n: 1 } })
    hub.disconnect(b)
    const pending = t.queue[0]
    const w = new FakeConn()
    hub.receive(w, { t: 'watch', code: a.joined.code })
    hub.disconnect(w)
    expect(t.queue[0]).toBe(pending)
  })

  it('보는 사람이 없으면 멈추고, 돌아오면 다시 진행한다', () => {
    const { hub, t, host } = makeHub()
    const a = host(2, [1])
    hub.receive(a, { t: 'start' })
    hub.receive(a, { t: 'act', action: { n: 1 } })
    hub.disconnect(a)
    expect(t.queue).toHaveLength(0)
    const again = new FakeConn()
    hub.receive(again, { t: 'resume', code: a.joined.code, token: a.joined.token })
    t.next()
    expect(again.room.view).toMatchObject({ total: 2, turn: 0 })
  })

  it('게임 중 나간 자리는 봇이 이어받고 다시 들어올 수 없다', () => {
    const { hub, t, host, guest } = makeHub()
    const a = host(2)
    const b = guest(a.joined.code)
    const { code, token } = b.joined
    hub.receive(a, { t: 'start' })
    hub.receive(a, { t: 'act', action: { n: 1 } })
    hub.receive(b, { t: 'leave' })
    expect(a.room.seats[1]).toMatchObject({ kind: 'bot', name: '나래' })
    t.next()
    expect(a.room.view).toMatchObject({ total: 2, turn: 0 })
    const again = new FakeConn()
    hub.receive(again, { t: 'resume', code, token })
    expect(again.error?.reason).toBe('bad-token')
  })

  it('끝까지 진행하면 over 가 된다', () => {
    const { hub, t, host } = makeHub()
    const a = host(2, [1])
    hub.receive(a, { t: 'start' })
    for (let k = 0; k < 10 && a.room.status === 'playing'; k++) {
      hub.receive(a, { t: 'act', action: { n: 2 } })
      t.flush()
    }
    expect(a.room.status).toBe('over')
    expect(a.room.actors).toEqual([])
    hub.receive(a, { t: 'act', action: { n: 1 } })
    expect(a.error?.reason).toBe('rejected')
  })

  it('방 수 상한과 오래 빈 방 정리', () => {
    const { hub, host, advance } = makeHub({ maxRooms: 2, idleMs: 1000 })
    const a = host(2)
    host(2)
    expect(host(2).error?.reason).toBe('busy')
    hub.disconnect(a)
    advance(2000)
    hub.sweep()
    expect(hub.size).toBe(1)
  })
})
