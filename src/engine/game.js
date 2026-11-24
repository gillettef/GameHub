// HEARSAY 게임 엔진 (서버 권위형). 룰북 v0.5를 따른다.
// 망각된 칸의 진실은 망각 순간 엔진에서도 지운다. 그래서 서버조차 지난 진실을 갖고 있지 않다(기둥 1).
import {
  HOUSES, GREY, EMPTY, SEASONS, MIN_PLAYERS, MAX_PLAYERS, DEFAULT_TIMING, plotsFor, questionsFor,
} from './rules.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RuleError extends Error {}

export class Game {
  /**
   * @param {{players: {name: string, isBot?: boolean, persona?: string}[], seed?: number, timing?: object}} opts
   */
  constructor({ players, seed = Date.now(), timing = {} }) {
    const n = players.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new RuleError(`인원은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 합니다`);
    this.n = n;
    this.rng = mulberry32(seed);
    this.timing = { ...DEFAULT_TIMING, ...timing };
    this.players = players.map((p, i) => ({
      name: String(p.name),
      color: HOUSES[i].id,
      isBot: !!p.isBot,
      persona: p.persona ?? null,
      score: 0,
    }));
    this.plots = plotsFor(n);
    // 진실: truth[plot][season] = 플레이어 번호 | null(주인 없음) | undefined(아직/망각됨)
    this.truth = this.plots.map(() => Array(SEASONS + 1).fill(undefined));
    // 공식 역사: chron[plot][season] = 집안 색 id | 'grey' | null
    this.chron = this.plots.map(() => Array(SEASONS + 1).fill(null));
    this.forgotten = 0; // 1..forgotten 계절이 망각됨
    this.season = 0;
    this.phase = 'lobby';
    this.questioner = Math.floor(this.rng() * n);
    this.deadline = null;
    this.version = 0;
    this.chat = [];
    this.chatSeq = 0;
    this.hooks = { onForget: null };
    this.claims = null;
    this.claimReveal = null;
    this.council = null;
    this.drawn = null;
    this.question = null;
    this.fists = null;
    this.result = null;
    this.questionNo = 0;
  }

  colorOf(i) { return this.players[i].color; }
  indexOfColor(c) { return this.players.findIndex((p) => p.color === c); }
  bump() { this.version++; }

  // ───────── 진행 ─────────
  start(now) {
    if (this.phase !== 'lobby') throw new RuleError('이미 시작했습니다');
    this.season = 1;
    this.beginClaim(now);
  }

  beginClaim(now) {
    this.phase = 'claim';
    this.claims = Array(this.n).fill(null);
    this.claimReveal = null;
    this.question = null;
    this.drawn = null;
    this.fists = null;
    this.result = null;
    this.deadline = now + this.timing.claimMs;
    this.bump();
  }

  resolveClaims(now) {
    const counts = new Map();
    for (const pi of this.claims) counts.set(pi, (counts.get(pi) ?? 0) + 1);
    const s = this.season;
    for (let pi = 0; pi < this.plots.length; pi++) this.truth[pi][s] = null;
    const feuds = [];
    this.claims.forEach((pi, player) => {
      if (counts.get(pi) === 1) this.truth[pi][s] = player;
      else if (!feuds.includes(pi)) feuds.push(pi);
    });
    this.claimReveal = { picks: this.claims.map((pi) => this.plots[pi].id), feuds: feuds.map((pi) => this.plots[pi].id) };
    this.phase = 'claimResult';
    this.deadline = now + this.timing.claimRevealMs;
    this.bump();
  }

  afterClaimResult(now) {
    if (this.season >= 2) {
      this.forget(this.season - 1);
      this.beginCouncil(this.season, now);
    } else {
      this.season++;
      this.beginClaim(now);
    }
  }

  forget(s) {
    const column = this.truth.map((row) => row[s]);
    this.hooks.onForget?.(s, column);
    for (const row of this.truth) row[s] = undefined; // 엔진에서도 진실을 지운다
    this.forgotten = s;
  }

  beginCouncil(kind, now) {
    this.council = { kind, left: questionsFor(this.n, kind) };
    this.beginQuestion(now);
  }

  askableSeasons(pi) {
    const out = [];
    for (let s = 1; s <= this.forgotten; s++) if (this.chron[pi][s] === null) out.push(s);
    return out;
  }

  beginQuestion(now) {
    if (this.council.left <= 0) { this.endCouncil(now); return; }
    const anyAskable = this.plots.some((_, pi) => this.askableSeasons(pi).length > 0);
    if (!anyAskable) { // FAQ: 질문을 건너뛰고 질문자 표지를 넘긴다
      this.council.left--;
      this.questioner = (this.questioner + 1) % this.n;
      this.beginQuestion(now);
      return;
    }
    const order = this.plots.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const drawn = order.slice(0, 2);
    if (!drawn.some((pi) => this.askableSeasons(pi).length)) {
      for (const pi of order.slice(2)) {
        drawn.push(pi);
        if (this.askableSeasons(pi).length) break;
      }
    }
    this.drawn = drawn;
    this.question = null;
    this.fists = null;
    this.result = null;
    this.phase = 'choose';
    this.deadline = now + this.timing.chooseMs;
    this.bump();
  }

  ask(player, plotId, season, now) {
    if (this.phase !== 'choose') throw new RuleError('지금은 질문 칸을 고를 때가 아닙니다');
    if (player !== this.questioner) throw new RuleError('질문자만 고를 수 있습니다');
    const pi = this.plots.findIndex((p) => p.id === plotId);
    if (pi < 0 || !this.drawn.includes(pi)) throw new RuleError('공개한 회상 카드의 구역이 아닙니다');
    if (!this.askableSeasons(pi).includes(season)) throw new RuleError('질문 가능 칸이 아닙니다');
    this.question = { plot: pi, season };
    this.questionNo++;
    this.phase = 'whisper';
    this.fists = Array(this.n).fill(undefined);
    this.deadline = now + this.timing.whisperMs;
    this.bump();
  }

  autoAsk(now) {
    for (const pi of this.drawn) {
      const ss = this.askableSeasons(pi);
      if (ss.length) { this.ask(this.questioner, this.plots[pi].id, ss[0], now); return; }
    }
  }

  allowedTokens(player) {
    return [...this.players.filter((_, i) => i !== player).map((p) => p.color), GREY, EMPTY];
  }

  fist(player, token, now) {
    if (this.phase !== 'whisper') throw new RuleError('지금은 증언할 때가 아닙니다');
    if (this.fists[player] !== undefined) throw new RuleError('이미 주먹을 내밀었습니다');
    if (!this.allowedTokens(player).includes(token)) throw new RuleError('낼 수 없는 증언 토큰입니다');
    this.fists[player] = token;
    this.bump();
    if (this.fists.every((f) => f !== undefined)) this.resolveQuestion(now);
  }

  claim(player, plotId, now) {
    if (this.phase !== 'claim') throw new RuleError('지금은 점유 단계가 아닙니다');
    if (this.claims[player] !== null) throw new RuleError('놓은 구역 카드는 바꿀 수 없습니다');
    const pi = this.plots.findIndex((p) => p.id === plotId);
    if (pi < 0) throw new RuleError('쓰지 않는 구역입니다');
    this.claims[player] = pi;
    this.bump();
    if (this.claims.every((c) => c !== null)) this.resolveClaims(now);
  }

  /** 집계 (6-4). 질문자의 유효한 증언으로 동점을 깬다. */
  static tally(fists, questioner) {
    const counts = {};
    fists.forEach((f) => { if (f && f !== EMPTY) counts[f] = (counts[f] ?? 0) + 1; });
    const entries = Object.entries(counts);
    if (!entries.length) return { counts, official: null };
    const max = Math.max(...entries.map(([, c]) => c));
    const leaders = entries.filter(([, c]) => c === max).map(([k]) => k);
    if (leaders.length === 1) return { counts, official: leaders[0] };
    const q = fists[questioner];
    if (q && q !== EMPTY && leaders.includes(q)) return { counts, official: q };
    return { counts, official: null };
  }

  resolveQuestion(now) {
    const { plot, season } = this.question;
    const fists = this.fists.map((f) => (f === undefined ? 'none' : f));
    const { counts, official } = Game.tally(fists.map((f) => (f === 'none' ? EMPTY : f)), this.questioner);
    const gains = Array(this.n).fill(0);
    this.chron[plot][season] = official ?? GREY;
    if (official) {
      const owner = this.indexOfColor(official);
      if (owner >= 0) gains[owner] += this.plots[plot].value;
      fists.forEach((f, i) => { if (f === official) gains[i] += 1; });
    }
    gains.forEach((g, i) => { this.players[i].score += g; });
    this.result = { plot: this.plots[plot].id, season, fists, counts, official, blank: official === null, gains };
    this.phase = 'result';
    this.deadline = now + this.timing.resultMs;
    this.bump();
  }

  afterResult(now) {
    this.council.left--;
    this.questioner = (this.questioner + 1) % this.n;
    this.beginQuestion(now);
  }

  endCouncil(now) {
    if (this.council.kind === 'final') {
      this.phase = 'ended';
      this.deadline = null;
      this.council = null;
      this.drawn = null;
      this.question = null;
      this.bump();
      return;
    }
    if (this.season === SEASONS) {
      this.forget(SEASONS);
      this.beginCouncil('final', now);
      return;
    }
    this.season++;
    this.beginClaim(now);
  }

  /** 시간 제한이 지난 단계를 진행한다. 바뀌었으면 true */
  tick(now) {
    let changed = false;
    for (let guard = 0; guard < 20 && this.deadline !== null && now >= this.deadline; guard++) {
      changed = true;
      switch (this.phase) {
        case 'claim': {
          for (let i = 0; i < this.n; i++) {
            if (this.claims[i] === null) this.claims[i] = Math.floor(this.rng() * this.plots.length);
          }
          this.resolveClaims(now);
          break;
        }
        case 'claimResult': this.afterClaimResult(now); break;
        case 'choose': this.autoAsk(now); break;
        case 'whisper': this.resolveQuestion(now); break;
        case 'result': this.afterResult(now); break;
        default: this.deadline = null;
      }
    }
    return changed;
  }

  // ───────── 말 ─────────
  canSpeak() {
    return ['claim', 'claimResult', 'whisper', 'result', 'ended'].includes(this.phase);
  }

  say(player, text, now, assert = null) {
    if (!this.canSpeak()) throw new RuleError('지금은 말할 수 없습니다 (질문 칸 선언 전 침묵)');
    const t = String(text ?? '').trim().slice(0, 140);
    if (!t) throw new RuleError('빈 말');
    let a = null;
    if (assert && this.phase === 'whisper') {
      const ans = String(assert.answer);
      if ([...this.players.map((p) => p.color), GREY].includes(ans)) a = { answer: ans, q: this.questionNo };
    }
    this.chat.push({ id: ++this.chatSeq, from: player, text: t, assert: a, at: now });
    this.chat = this.chat.filter((m) => now - m.at < this.timing.chatTtlMs);
    this.bump();
  }

  /** 지금 질문에 대해 나온 구조화된 주장들 */
  currentAssertions() {
    return this.chat.filter((m) => m.assert && m.assert.q === this.questionNo);
  }

  // ───────── 보기 (플레이어별) ─────────
  view(me, now) {
    const visibleCol = (s) => s > this.forgotten && s <= this.season;
    const board = this.plots.map((pl, pi) => ({
      id: pl.id, name: pl.name, value: pl.value,
      cells: Array.from({ length: SEASONS }, (_, k) => {
        const s = k + 1;
        const t = this.truth[pi][s];
        return {
          tile: visibleCol(s) && t !== undefined && t !== null ? this.colorOf(t) : null,
          chron: this.chron[pi][s],
          forgotten: s <= this.forgotten,
        };
      }),
    }));
    const inWhisper = this.phase === 'whisper';
    const players = this.players.map((p, i) => ({
      name: p.name, color: p.color, score: p.score, isBot: p.isBot, persona: p.persona,
      ready: this.phase === 'claim' ? this.claims[i] !== null : inWhisper ? this.fists[i] !== undefined : false,
    }));
    const drawn = this.phase === 'choose' && this.drawn
      ? this.drawn.map((pi) => ({ id: this.plots[pi].id, askable: this.askableSeasons(pi) }))
      : null;
    const mine = me >= 0 && me < this.n;
    return {
      version: this.version,
      phase: this.phase,
      season: this.season,
      forgotten: this.forgotten,
      council: this.council ? { kind: this.council.kind, left: this.council.left } : null,
      questioner: this.questioner,
      deadlineIn: this.deadline === null ? null : Math.max(0, this.deadline - now),
      board,
      players,
      drawn,
      question: this.question ? { plot: this.plots[this.question.plot].id, season: this.question.season } : null,
      claimReveal: this.phase === 'claimResult' ? this.claimReveal : null,
      result: this.phase === 'result' ? this.result : null,
      chat: this.chat.filter((m) => now - m.at < this.timing.chatTtlMs)
        .map((m) => ({ id: m.id, from: m.from, text: m.text, assert: m.assert?.answer ?? null, ttl: this.timing.chatTtlMs - (now - m.at) })),
      canSpeak: this.canSpeak(),
      me: mine ? {
        index: me,
        color: this.colorOf(me),
        claim: this.phase === 'claim' && this.claims[me] !== null ? this.plots[this.claims[me]].id : null,
        fist: inWhisper ? (this.fists[me] ?? null) : null,
        tokens: this.allowedTokens(me),
      } : null,
    };
  }
}
