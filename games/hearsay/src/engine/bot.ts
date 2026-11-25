// 봇: 불완전한 기억을 가진 이야기꾼.
// 망각 순간 열을 "본 대로" 기억하되 일부만, 가끔 틀리게 기억한다. 계절이 지날수록 기억이 흐려진다.
// 두뇌(Brain)는 평범한 객체라 게임 상태와 함께 복제된다. 화면(view)에는 절대 보내지 않는다.
import { allowedTokens, askableSeasons, colorOf, currentAssertions, indexOfColor, type Game, type Token } from './game.ts'
import { nextRandom } from './random.ts'
import { EMPTY, GREY, type PlotId } from './rules.ts'

export interface Persona {
  name: string
  skill: number
  decay: number
  mistake: number
  lie: number
  follow: number
}

export const PERSONAS = {
  archivist: { name: '기록형', skill: 0.7, decay: 0.86, mistake: 0.08, lie: 0, follow: 0.2 },
  politician: { name: '정치형', skill: 0.5, decay: 0.76, mistake: 0.15, lie: 0.15, follow: 0.65 },
  schemer: { name: '조작형', skill: 0.5, decay: 0.76, mistake: 0.15, lie: 0.5, follow: 0.4 },
  follower: { name: '휩쓸림형', skill: 0.35, decay: 0.64, mistake: 0.22, lie: 0, follow: 0.9 },
} satisfies Record<string, Persona>
export type PersonaId = keyof typeof PERSONAS
export const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[]
export const isPersona = (v: unknown): v is PersonaId => typeof v === 'string' && Object.hasOwn(PERSONAS, v)

export const BOT_NAMES = ['늙은 어부', '물질하는 해녀', '소금장수', '대숲 지기', '포구 객주', '우물가 할매', '갯벌 소년', '언덕 목동']

export interface Brain {
  persona: PersonaId
  /** mulberry32 난수 상태 */
  rng: number
  /** `${pi}:${s}` → 기억 */
  memory: Record<string, { answer: string; conf: number }>
  /** 회의별 회상 결과 `${forgotten}:${pi}:${s}` */
  recall: Record<string, string | null>
}

export function newBrain(persona: string | null, seed: number): Brain {
  return { persona: isPersona(persona) ? persona : 'politician', rng: seed >>> 0, memory: {}, recall: {} }
}

const P = (b: Brain): Persona => PERSONAS[b.persona]
const rand = (b: Brain) => nextRandom(b)

/** 망각 순간: 사라지는 열을 불완전하게 기억한다 */
export function onForget(g: Game, b: Brain, index: number, season: number, column: readonly (number | null)[]): void {
  const p = P(b)
  for (const m of Object.values(b.memory)) m.conf *= p.decay
  const colors: string[] = [...g.players.map((pl) => pl.color), GREY]
  column.forEach((owner, pi) => {
    const truth = owner === null || owner < 0 ? GREY : colorOf(g, owner)
    const own = owner === index
    const chance = own ? 0.95 : p.skill
    if (rand(b) >= chance) return
    let answer = truth
    if (!own && rand(b) < p.mistake) {
      const others = colors.filter((c) => c !== truth)
      answer = others[Math.floor(rand(b) * others.length)]!
    }
    b.memory[`${pi}:${season}`] = { answer, conf: own ? 0.97 : 0.92 }
  })
}

function recall(g: Game, b: Brain, pi: number, season: number): string | null {
  // 같은 회의 안에서는 같은 결과를 기억해 낸다 (고를 때와 증언할 때가 어긋나지 않게)
  const key = `${g.forgotten}:${pi}:${season}`
  if (Object.hasOwn(b.recall, key)) return b.recall[key]!
  const m = b.memory[`${pi}:${season}`]
  const out = m && rand(b) < m.conf ? m.answer : null
  b.recall[key] = out
  return out
}

// ───────── 결정 ─────────
export function chooseClaim(g: Game, b: Brain): PlotId {
  const plots = g.plots
  const w = plots.map((p) => p.value ** 1.5)
  let r = rand(b) * w.reduce((a, c) => a + c, 0)
  for (let i = 0; i < plots.length; i++) {
    r -= w[i]!
    if (r <= 0) return plots[i]!.id
  }
  return plots[0]!.id
}

export function chooseQuestion(g: Game, b: Brain, index: number): { plot: PlotId; season: number } {
  const me = colorOf(g, index)
  const options: { pi: number; s: number; mem: string | null }[] = []
  for (const pi of g.drawn!) for (const s of askableSeasons(g, pi)) options.push({ pi, s, mem: recall(g, b, pi, s) })
  const own = options.filter((o) => o.mem === me)
  const known = options.filter((o) => o.mem && o.mem !== me)
  let pick: (typeof options)[number]
  if (own.length && rand(b) < 0.6) pick = own.sort((x, y) => g.plots[y.pi]!.value - g.plots[x.pi]!.value)[0]!
  else if (known.length) pick = known[Math.floor(rand(b) * known.length)]!
  else pick = options[Math.floor(rand(b) * options.length)]!
  return { plot: g.plots[pick.pi]!.id, season: pick.s }
}

/** 속삭임 시간에 하는 말: { text, answer } 또는 null */
export function assertion(g: Game, b: Brain, index: number): { text: string; answer: string | null } | null {
  const p = P(b)
  const me = colorOf(g, index)
  const { plot: pi, season } = g.question!
  const plot = g.plots[pi]!
  const mem = recall(g, b, pi, season)
  const nameOf = (c: string) => `${g.players[indexOfColor(g, c)]!.name}(${houseName(c)}) 땅이었어`
  if (mem === me) return { text: pick(b, ['그거 내 땅이었어. 누가 말 좀 해 줘.', `${season}계절 ${plot.name}? 내 거였지.`]), answer: me }
  if (mem === null && p.lie && plot.value >= 3 && rand(b) < p.lie) {
    return { text: pick(b, ['그 땅, 내가 갖고 있었어. 기억나지?', `분명히 내가 ${plot.name}에 있었어.`]), answer: me }
  }
  if (mem) {
    return {
      text: mem === GREY ? `${season}계절 ${plot.name}엔 아무도 없었어.` : `${season}계절 ${plot.name}${eunNeun(plot.name)} ${nameOf(mem)}.`,
      answer: mem,
    }
  }
  if (rand(b) < 0.35) return { text: pick(b, ['기억이 잘 안 나네…', '그 계절은 흐릿해.']), answer: null }
  return null
}

export function testimony(g: Game, b: Brain, index: number): Token {
  const p = P(b)
  const me = colorOf(g, index)
  const { plot: pi, season } = g.question!
  const allowed = allowedTokens(g, index)
  const mem = recall(g, b, pi, season)
  const tally: Record<string, number> = {}
  for (const m of currentAssertions(g)) {
    if (m.from === index || !m.assert) continue
    tally[m.assert.answer] = (tally[m.assert.answer] ?? 0) + 1
  }
  const popular =
    Object.entries(tally)
      .filter(([a]) => allowed.includes(a))
      .sort((x, y) => y[1] - x[1])[0]?.[0] ?? null

  if (mem === me) {
    // 내 땅은 내가 증언할 수 없다. 질 것 같으면 이길 답에 편승, 아니면 빈 주먹
    if (popular && popular !== me && rand(b) < p.follow * 0.5) return popular
    return EMPTY
  }
  if (mem && allowed.includes(mem)) {
    if (popular && popular !== mem && rand(b) < p.follow * 0.4) return popular
    return mem
  }
  if (popular && rand(b) < Math.max(p.follow, 0.5)) return popular
  return rand(b) < 0.4 ? GREY : EMPTY
}

function pick(b: Brain, arr: readonly string[]): string {
  return arr[Math.floor(rand(b) * arr.length)]!
}

/** 받침에 따라 은/는 */
export function eunNeun(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? '은' : '는'
}

function houseName(c: string): string {
  return ({ red: '빨강', blue: '파랑', yellow: '노랑', green: '초록', purple: '보라', black: '검정', grey: '회색' } as Record<string, string>)[c] ?? c
}
