// 봇: 불완전한 기억을 가진 이야기꾼.
// 망각 순간 열을 "본 대로" 기억하되 일부만, 가끔 틀리게 기억한다. 계절이 지날수록 기억이 흐려진다.
import { GREY, EMPTY } from './rules.js';
import { mulberry32 } from './game.js';

export const PERSONAS = {
  archivist: { name: '기록형', skill: 0.7, decay: 0.86, mistake: 0.08, lie: 0, follow: 0.2 },
  politician: { name: '정치형', skill: 0.5, decay: 0.76, mistake: 0.15, lie: 0.15, follow: 0.65 },
  schemer: { name: '조작형', skill: 0.5, decay: 0.76, mistake: 0.15, lie: 0.5, follow: 0.4 },
  follower: { name: '휩쓸림형', skill: 0.35, decay: 0.64, mistake: 0.22, lie: 0, follow: 0.9 },
};
export const PERSONA_IDS = Object.keys(PERSONAS);

export const BOT_NAMES = ['늙은 어부', '물질하는 해녀', '소금장수', '대숲 지기', '포구 객주', '우물가 할매', '갯벌 소년', '언덕 목동'];

export class BotBrain {
  constructor(game, index, personaId, seed) {
    this.game = game;
    this.index = index;
    this.p = PERSONAS[personaId] ?? PERSONAS.politician;
    this.rng = mulberry32(seed);
    this.memory = new Map(); // `${pi}:${s}` -> { answer, conf }
    this.recallCache = new Map(); // 질문 번호별 회상 결과
  }

  get color() { return this.game.colorOf(this.index); }

  /** 망각 순간: 사라지는 열을 불완전하게 기억한다 */
  onForget(season, column) {
    for (const m of this.memory.values()) m.conf *= this.p.decay;
    const colors = [...this.game.players.map((p) => p.color), GREY];
    column.forEach((owner, pi) => {
      const truth = owner === null || owner === undefined ? GREY : this.game.colorOf(owner);
      const own = owner === this.index;
      const chance = own ? 0.95 : this.p.skill;
      if (this.rng() >= chance) return;
      let answer = truth;
      if (!own && this.rng() < this.p.mistake) {
        const others = colors.filter((c) => c !== truth);
        answer = others[Math.floor(this.rng() * others.length)];
      }
      this.memory.set(`${pi}:${season}`, { answer, conf: own ? 0.97 : 0.92 });
    });
  }

  recall(pi, season) {
    // 같은 회의 안에서는 같은 결과를 기억해 낸다 (고를 때와 증언할 때가 어긋나지 않게)
    const key = `${this.game.forgotten}:${pi}:${season}`;
    if (this.recallCache.has(key)) return this.recallCache.get(key);
    const m = this.memory.get(`${pi}:${season}`);
    const out = m && this.rng() < m.conf ? m.answer : null;
    this.recallCache.set(key, out);
    return out;
  }

  // ───────── 결정 ─────────
  chooseClaim() {
    const plots = this.game.plots;
    const w = plots.map((p) => p.value ** 1.5);
    let r = this.rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < plots.length; i++) { r -= w[i]; if (r <= 0) return plots[i].id; }
    return plots[0].id;
  }

  chooseQuestion() {
    const g = this.game;
    const options = [];
    for (const pi of g.drawn) for (const s of g.askableSeasons(pi)) options.push({ pi, s, mem: this.recall(pi, s) });
    const own = options.filter((o) => o.mem === this.color);
    const known = options.filter((o) => o.mem && o.mem !== this.color);
    let pick;
    if (own.length && this.rng() < 0.6) pick = own.sort((a, b) => g.plots[b.pi].value - g.plots[a.pi].value)[0];
    else if (known.length) pick = known[Math.floor(this.rng() * known.length)];
    else pick = options[Math.floor(this.rng() * options.length)];
    return { plot: g.plots[pick.pi].id, season: pick.s };
  }

  /** 속삭임 시간에 하는 말: { text, answer } 또는 null */
  assertion() {
    const g = this.game;
    const { plot: pi, season } = g.question;
    const plot = g.plots[pi];
    const mem = this.recall(pi, season);
    const nameOf = (c) => `${g.players[g.indexOfColor(c)].name}(${houseName(c)}) 땅이었어`;
    if (mem === this.color) return { text: pick(this.rng, ['그거 내 땅이었어. 누가 말 좀 해 줘.', `${season}계절 ${plot.name}? 내 거였지.`]), answer: this.color };
    if (mem === null && this.p.lie && plot.value >= 3 && this.rng() < this.p.lie) {
      return { text: pick(this.rng, ['그 땅, 내가 갖고 있었어. 기억나지?', `분명히 내가 ${plot.name}에 있었어.`]), answer: this.color };
    }
    if (mem) return { text: mem === GREY ? `${season}계절 ${plot.name}엔 아무도 없었어.` : `${season}계절 ${plot.name}${eunNeun(plot.name)} ${nameOf(mem)}.`, answer: mem };
    if (this.rng() < 0.35) return { text: pick(this.rng, ['기억이 잘 안 나네…', '그 계절은 흐릿해.']), answer: null };
    return null;
  }

  testimony() {
    const g = this.game;
    const { plot: pi, season } = g.question;
    const allowed = g.allowedTokens(this.index);
    const mem = this.recall(pi, season);
    const tally = {};
    for (const m of g.currentAssertions()) {
      if (m.from === this.index || !m.assert) continue;
      tally[m.assert.answer] = (tally[m.assert.answer] ?? 0) + 1;
    }
    const popular = Object.entries(tally).filter(([a]) => allowed.includes(a)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    if (mem === this.color) {
      // 내 땅은 내가 증언할 수 없다. 질 것 같으면 이길 답에 편승, 아니면 빈 주먹
      if (popular && popular !== this.color && this.rng() < this.p.follow * 0.5) return popular;
      return EMPTY;
    }
    if (mem && allowed.includes(mem)) {
      if (popular && popular !== mem && this.rng() < this.p.follow * 0.4) return popular;
      return mem;
    }
    if (popular && this.rng() < Math.max(this.p.follow, 0.5)) return popular;
    return this.rng() < 0.4 ? GREY : EMPTY;
  }
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
/** 받침에 따라 은/는 */
export function eunNeun(word) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? '은' : '는';
}
function houseName(c) {
  return { red: '빨강', blue: '파랑', yellow: '노랑', green: '초록', purple: '보라', black: '검정', grey: '회색' }[c] ?? c;
}
