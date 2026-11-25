import { describe, expect, it } from 'vitest'
import { defaultSeats, inviteLink, namedSeats, resizeSeats, toggleSeat } from '../src/seats'
import { FIT, clampView, zoomAt } from '../src/zoom'

const size = { width: 400, height: 600 }

describe('보드 확대·이동', () => {
  it('배율은 1~최대, 이동은 내용이 비지 않는 범위', () => {
    expect(clampView({ scale: 0.5, x: 90, y: -90 }, size, 3)).toEqual(FIT)
    expect(clampView({ scale: 9, x: 9999, y: -9999 }, size, 3)).toEqual({ scale: 3, x: 400, y: -600 })
  })

  it('손가락 아래의 점은 확대해도 제자리에 있다', () => {
    const at = { x: 50, y: -40 }
    const v = zoomAt(FIT, at, 2, { x: 0, y: 0 }, size, 3)
    // 확대 전 내용점 at 은 확대 뒤에도 at 에 보인다
    expect({ x: at.x * v.scale + v.x, y: at.y * v.scale + v.y }).toEqual(at)
  })
})

describe('좌석 구성', () => {
  it('첫 자리는 나, 나머지는 봇. 인원을 바꿔도 고른 구성을 유지한다', () => {
    const seats = toggleSeat(defaultSeats(2, true, '가람'), 1)
    expect(seats.map((s) => s.kind)).toEqual(['human', 'human'])
    expect(resizeSeats(seats, 4, true).map((s) => s.kind)).toEqual(['human', 'human', 'bot', 'bot'])
    expect(resizeSeats(seats, 2, true)).toEqual(seats)
    expect(defaultSeats(3, false, '').every((s) => s.kind === 'human')).toBe(true)
  })

  it('닉네임이 비면 혼자일 때 나, 여럿이면 번호', () => {
    expect(namedSeats(defaultSeats(2, true, ''), ' ')[0]!.name).toBe('나')
    expect(namedSeats(defaultSeats(2, false, ''), '')[0]!.name).toBe('1번')
    expect(namedSeats(defaultSeats(2, true, ''), '가람')[0]!.name).toBe('가람')
  })

  it('초대 링크는 게임 디렉터리 + room 코드', () => {
    expect(inviteLink('http://h/crease/?x=1#a', 'AB12')).toBe('http://h/crease/?room=AB12')
  })
})
