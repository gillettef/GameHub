// 시드 난수(mulberry32)와 카드 id. 엔진은 Math.random·crypto 를 쓰지 않는다.
// 엔진 함수(주사위·덱 섞기·카드 id)는 지금 묶인 난수 상태(withRng)를 쓴다. 상태는 JSON 으로 저장할 수 있는 숫자 둘이라
// src/def.ts 가 판(Table)에 넣어 두고 행동마다 복제한 판에 묶는다. 같은 시드·같은 행동이면 같은 판이 된다.
// 묶인 상태가 없으면(밸런스 스크립트·규칙 검증) 고정 시드의 기본 상태를 쓴다.

export interface RngState {
  /** mulberry32 상태(32비트 정수) */
  s: number
  /** 지금까지 만든 카드 id 수 */
  ids: number
  /** 지금까지 만든 학교 소식 카드 수 */
  news: number
}

export const createRng = (seed: number): RngState => ({ s: seed | 0, ids: 0, news: 0 })

function next(st: RngState): number {
  st.s = (st.s + 0x6d2b79f5) | 0
  let t = st.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const fallbackGame = createRng(20261125)
const fallbackBot = createRng(19)
let game: RngState | null = null
let bot: RngState | null = null

/** 0 이상 1 미만: 게임 규칙의 난수(주사위·덱) */
export const random = (): number => next(game ?? fallbackGame)

/** 0 이상 1 미만: 봇 판단의 난수. 게임 난수와 따로 둬서 봇이 생각해도 다음 주사위가 바뀌지 않는다 */
export const botRandom = (): number => next(bot ?? fallbackBot)

/** 새 카드 id (판마다 c1, c2, …) */
export function nextId(): string {
  const st = game ?? fallbackGame
  st.ids += 1
  return `c${st.ids}`
}

/** 새 학교 소식 카드 id (판마다 news-0, news-1, …) */
export function nextNewsId(): string {
  const st = game ?? fallbackGame
  return `news-${st.news++}`
}

/** fn 을 도는 동안 엔진 난수를 st 로 묶는다(st 는 그 자리에서 바뀐다) */
export function withRng<T>(st: RngState, fn: () => T): T {
  const prev = game
  game = st
  try {
    return fn()
  } finally {
    game = prev
  }
}

/** fn 을 도는 동안 봇 난수를 st 로 묶는다 */
export function withBotRng<T>(st: RngState, fn: () => T): T {
  const prev = bot
  bot = st
  try {
    return fn()
  } finally {
    bot = prev
  }
}

/** 묶인 상태가 없을 때 쓰는 기본 난수를 다시 정한다(밸런스 스크립트의 SEED) */
export function reseedDefault(seed: number): void {
  fallbackGame.s = seed | 0
  fallbackGame.ids = 0
  fallbackGame.news = 0
  fallbackBot.s = (seed ^ 0x5bd1e995) | 0
}
