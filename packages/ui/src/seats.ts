import type { SeatInfo } from '@gamehub/net'

/** 처음 화면의 좌석 구성: 첫 자리는 사람, 나머지는 bots 에 따라 */
export function defaultSeats(count: number, bots: boolean, name: string): SeatInfo[] {
  return Array.from({ length: count }, (_, i) =>
    i > 0 && bots ? { kind: 'bot', name: `봇 ${i + 1}` } : { kind: 'human', name: i === 0 ? name : `${i + 1}번` },
  )
}

/** 인원을 바꿔도 고른 구성은 유지한다. 늘어난 자리는 봇(없으면 사람) */
export function resizeSeats(seats: SeatInfo[], count: number, bots: boolean): SeatInfo[] {
  return Array.from({ length: count }, (_, i) => seats[i] ?? defaultSeats(count, bots, '')[i]!)
}

export function toggleSeat(seats: SeatInfo[], index: number): SeatInfo[] {
  return seats.map((s, i) => {
    if (i !== index) return s
    return s.kind === 'bot' ? { kind: 'human', name: `${i + 1}번` } : { kind: 'bot', name: `봇 ${i + 1}` }
  })
}

/** 첫 자리 사람에게 닉네임을 붙인다. 비었고 사람이 혼자면 '나' */
export function namedSeats(seats: SeatInfo[], name: string): SeatInfo[] {
  const alone = seats.filter((s) => s.kind === 'human').length === 1
  return seats.map((s, i) => (i === 0 && s.kind === 'human' ? { ...s, name: name.trim() || (alone ? '나' : '1번') } : s))
}

export function inviteLink(pageUrl: string, code: string): string {
  const url = new URL(pageUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', code)
  return url.href
}
