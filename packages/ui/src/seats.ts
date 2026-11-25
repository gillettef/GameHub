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

/** 첫 자리 사람에게 닉네임을 붙인다. 비었고 사람이 혼자면 '나'. 다른 사람 자리는 비면 번호 */
export function namedSeats(seats: SeatInfo[], name: string): SeatInfo[] {
  const alone = seats.filter((s) => s.kind === 'human').length === 1
  return seats.map((s, i) => {
    if (s.kind !== 'human') return s
    if (i === 0) return { ...s, name: name.trim() || (alone ? '나' : '1번') }
    return { ...s, name: s.name.trim() || `${i + 1}번` }
  })
}

export function renameSeat(seats: SeatInfo[], index: number, name: string): SeatInfo[] {
  return seats.map((s, i) => (i === index ? { ...s, name } : s))
}

/** 저장해 둔 한 기기 좌석 구성. 형식이 틀리면 null */
export function restoreSeats(raw: unknown, min: number, max: number, bots: boolean): SeatInfo[] | null {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) return null
  const seats = raw.map((s: unknown, i): SeatInfo | null => {
    const v = s as { kind?: unknown; name?: unknown } | null
    if (!v || typeof v.name !== 'string') return null
    if (v.kind === 'bot' && bots) return { kind: 'bot', name: `봇 ${i + 1}` }
    return v.kind === 'human' || v.kind === 'bot' ? { kind: 'human', name: v.name.slice(0, 12) } : null
  })
  return seats.every((s) => s !== null) ? (seats as SeatInfo[]) : null
}

export function inviteLink(pageUrl: string, code: string): string {
  const url = new URL(pageUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', code)
  return url.href
}
