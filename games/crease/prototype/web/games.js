// 게임 진행 컨트롤러. 화면은 이 인터페이스만 쓴다:
//   state, seats[{name, kind, online}], mine(seat)→bool, canAct(), act(action), log[], status, subscribe(fn)
import {
  newGame, startTurn, doStep, doFold, finishTurn, legalSteps, legalFolds, cellName, unkey, fromView,
} from './engine.js';
import { chooseTurn } from './bot.js';
import { RULES } from './rules-config.js';

export function describe(a) {
  if (a.type === 'step') return `→ ${cellName(...a.to)}`;
  const side = a.side === 'L' ? '왼쪽' : '오른쪽';
  return a.type === 'fold' ? `${side} ${a.width}선 접기` : `${side} 펼치기`;
}

class Emitter {
  constructor() { this.fns = new Set(); }
  subscribe(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  emit(ev) { for (const fn of this.fns) fn(ev); }
}

/** 한 기기에서 진행하는 게임(사람·봇 혼합, 봇끼리 관전 포함) */
export class LocalGame extends Emitter {
  constructor({ n, seats, seed = Math.floor(Math.random() * 1e9), speed = 1 }) {
    super();
    this.kind = 'local';
    this.n = n;
    this.seats = seats.map((s, i) => ({ name: s.name || `${s.kind === 'bot' ? '봇' : '플레이어'} ${i + 1}`, kind: s.kind, profile: s.profile || 'balanced', online: true }));
    this.state = newGame(n, seed, RULES);
    this.log = [];
    this.speed = speed;
    this.paused = false;
    this.timer = null;
    this.status = 'playing';
    this.spectate = this.seats.every((s) => s.kind === 'bot');
  }

  start() {
    startTurn(this.state);
    this.push('게임 시작');
    this.changed();
  }

  mine(seat) { return this.seats[seat]?.kind === 'human'; }
  canAct() { return !this.state.over && this.seats[this.state.current].kind === 'human'; }
  push(text, extra = {}) { this.log.push({ text, ...extra }); if (this.log.length > 80) this.log.shift(); }

  act(a, byBot = false) {
    const s = this.state;
    if (!byBot && !this.canAct()) return Promise.resolve();
    const p = s.players[s.current];
    const who = this.seats[s.current].name;
    if (a.type === 'end') {
      const spawned = finishTurn(s);
      this.push(`${who}: 차례 끝`);
      if (spawned != null) {
        const [c, r] = unkey(spawned);
        this.push(`별똥별 → ${cellName(c, r)}${s.lastBurst ? ` · 날개 터뜨리기!` : ''}`, { kind: 'spawn' });
      }
      if (s.over) { this.status = 'over'; this.push('게임 끝', { kind: 'over' }); } else {
        if (s.activeIds) this.push(`동점 결승: ${s.activeIds.map((i) => this.seats[i].name).join(' · ')}`);
        startTurn(s);
      }
    } else {
      const before = { score: p.score, carried: p.carried };
      if (a.type === 'step') doStep(s, a.to); else doFold(s, a);
      let msg = `${who}: ${describe(a)}`;
      if (p.score > before.score) msg += ` · <b>${p.score - before.score}점 득점</b>`;
      else if (p.carried > before.carried) msg += ' · 조각 줍기';
      this.push(msg, { kind: 'act' });
    }
    this.changed();
    return Promise.resolve();
  }

  changed() {
    this.emit();
    clearTimeout(this.timer);
    if (this.state.over || this.paused) return;
    if (this.seats[this.state.current].kind === 'bot') this.timer = setTimeout(() => this.botStep(), this.delay(700));
  }

  delay(ms) { return ms / this.speed; }

  botStep() {
    if (this.paused || this.state.over) return;
    const s = this.state;
    if (!this.plan || this.plan.turn !== s.turn) this.plan = { turn: s.turn, actions: chooseTurn(s, this.seats[s.current].profile) };
    const a = this.plan.actions.shift() || { type: 'end' };
    try { this.act(a, true); } catch { this.act({ type: 'end' }, true); }
  }

  setPaused(v) { this.paused = v; if (!v) this.changed(); else { clearTimeout(this.timer); this.emit(); } }
  setSpeed(v) { this.speed = v; this.emit(); }
  stop() { clearTimeout(this.timer); this.paused = true; }
}

/** 서버 대전방에 붙는 게임 */
export class OnlineGame extends Emitter {
  constructor({ code, token }) {
    super();
    this.kind = 'online';
    this.code = code;
    this.token = token;
    this.snap = null;
    this.state = null;
    this.seats = [];
    this.log = [];
    this.status = 'connecting';
    this.connected = false;
  }

  connect() {
    const url = `api/rooms/${this.code}/events${this.token ? `?token=${encodeURIComponent(this.token)}` : ''}`;
    this.es = new EventSource(url);
    this.es.onmessage = (e) => {
      const snap = JSON.parse(e.data);
      this.snap = snap;
      this.status = snap.status;
      this.seats = snap.seats;
      this.you = snap.you;
      this.n = snap.n;
      this.log = snap.log;
      this.state = snap.view ? fromView(snap.view, RULES) : null;
      this.connected = true;
      this.emit();
    };
    this.es.onerror = () => { this.connected = false; this.emit({ type: 'net' }); };
  }

  mine(seat) { return seat === this.you; }
  canAct() { return this.status === 'playing' && this.state && !this.state.over && this.state.current === this.you; }

  async post(path, body) {
    const res = await fetch(`api/rooms/${this.code}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: this.token, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '요청 실패');
    return data;
  }

  act(action) { return this.post('/act', { action }); }
  start() { return this.post('/start', {}); }
  setSeat(seat, kind) { return this.post('/seat', { seat, kind }); }
  stop() { this.es?.close(); }
}

export async function createRoom({ n, name, bots }) {
  const res = await fetch('api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n, name, bots }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '방을 만들지 못했습니다');
  return data;
}

export async function joinRoom(code, name) {
  const res = await fetch(`api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '참가하지 못했습니다');
  return data;
}

export { legalSteps, legalFolds, RULES };
