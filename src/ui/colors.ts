/** Claude Design 캔버스의 주사위 색과 기호 (CLAUDE.md 비주얼 디자인) */
import { isTime, type Color, type Face } from '../engine'

export const DIE_COLORS: Record<
  Color,
  { fill: string; light: string; dark: string; ink: string; symbol: string; name: string; stroke?: string }
> = {
  red: { fill: '#E5484D', light: '#ff7a7e', dark: '#a52a2f', ink: '#ffffff', symbol: '▲', name: '빨강' },
  blue: { fill: '#3B7BF6', light: '#78a6ff', dark: '#1f4fb0', ink: '#ffffff', symbol: '●', name: '파랑' },
  green: { fill: '#34C483', light: '#6fe3ad', dark: '#1d8a59', ink: '#0c2a1c', symbol: '■', name: '초록' },
  yellow: { fill: '#F5C842', light: '#ffe17f', dark: '#b88f12', ink: '#2b2200', symbol: '★', name: '노랑' },
  black: {
    fill: '#2B2838',
    light: '#4a4560',
    dark: '#15131d',
    ink: '#ece9ff',
    symbol: '◆',
    name: '검정',
    stroke: '#6d6890',
  },
}

/** 색이 없는 ⧗ 면 (§2 v0.7). 진주빛 무채색, 기호 없음 */
export const BLANK_FACE = { fill: '#cfcbe3', light: '#f3f1ff', dark: '#8f8aab', ink: '#2b2838', symbol: '', name: '무색', stroke: undefined }

/** 면 색 팔레트. undefined(⧗ 면)는 무색 */
export function tint(color: Color | undefined): (typeof DIE_COLORS)[Color] {
  return color ? DIE_COLORS[color] : BLANK_FACE
}

/** 플레이어 자리 색 (카드 머리띠 색을 빌려 쓴다) */
export const SEAT_COLORS = ['#9b8cff', '#5ad1e6', '#f2a65a', '#ff8a7a'] as const

export function seatColor(seat: number): string {
  return SEAT_COLORS[seat % SEAT_COLORS.length] ?? '#9b8cff'
}

export function faceLabel(face: Face): string {
  return isTime(face) ? '시간' : String(face)
}

export function colorLabel(color: Color | undefined): string {
  return tint(color).name
}

/** 라운드별 기본 점수 (§6~§8 v0.7): 같은 색 연결 하나, 라운드 끝에 확정 */
export const BASE_INFO = {
  1: { name: '선', rule: '가장 긴 같은 색 가로 연속' },
  2: { name: '평면', rule: '가장 넓은 같은 색 영역' },
  3: { name: '입체', rule: '가장 높은 같은 색 세로 연속' },
} as const

export const ROUND_INFO = [
  { round: 1, dim: '1차원', name: '선', quote: '선 위의 존재는 위밖에 보지 못한다.', hint: '가운데에서 시작해 양 끝에 붙여 5칸 선을 만드세요' },
  { round: 2, dim: '2차원', name: '평면', quote: '선이 옆으로 펼쳐지면, 이웃이 생긴다.', hint: '선 뒤쪽 칸에 맞닿게 놓아 평면을 펼치세요' },
  { round: 3, dim: '3차원', name: '입체', quote: '평면이 위로 솟으면, 그림자가 생긴다.', hint: '아래보다 큰 숫자만 쌓아요. ⧗은 언제나 올릴 수 있고, ⧗ 위는 끝' },
  { round: 4, dim: '4차원', name: '시간', quote: '시간은 앞으로만 흐르지만, 설계자는 거꾸로 거슬러 오를 수 있다.', hint: '⧗ 꼭대기 주사위를 옆 칸으로 한 칸 넘기세요' },
] as const
