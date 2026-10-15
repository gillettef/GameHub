import { MAX_AGENTS, PLAYERS, createGame, demandRemaining, isDemand, nextRound, rankings, resolveRound } from '../core';
import type { Demand, GameState, RoundSubmission, TacticKey } from '../core';
import { loadProfile, loadSession, newProfile, saveProfile, saveSession, type Session } from '../store/storage';
import { homeScreen, registerScreen } from './screens/home';
import { bidScreen, finalScreen, handoffScreen, resultScreen } from './screens/game';
import { rulesSheet } from './screens/rules';
import { setupScreen } from './screens/setup';
import { slotOffer, type Draft, type Seat, type Slot, type UiState } from './view';

const AI_NAMES = ['AI 알파', 'AI 브라보', 'AI 찰리'];
const NICK_RE = /[<>&"'\s]/g;
/** 자리 이름은 가운데 공백 허용 ("AI 알파", "플레이어 2") */
const cleanSeatName = (s: string) => s.replace(/[<>&"']/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);

const ui: UiState = {
  profile: loadProfile(),
  session: loadSession(),
  view: 'home',
  seats: [],
  draft: null,
  rulesOpen: false,
  renaming: false,
  error: '',
};

const root = () => document.getElementById('app')!;
const humansOf = (g: GameState) => g.agents.flatMap((a, i) => (a.kind === 'human' ? [i] : []));
const persist = () => saveSession(ui.session);

// ── 렌더링 ──────────────────────────────────────────────

function screenHtml(): string {
  if (!ui.profile || ui.renaming) return registerScreen(ui);
  if (ui.view === 'setup') return setupScreen(ui);
  const s = ui.session;
  if (ui.view !== 'game' || !s) return homeScreen(ui);
  switch (s.screen) {
    case 'handoff':
      return handoffScreen(s);
    case 'bid':
      return bidScreen(s, ensureDraft(s));
    case 'result':
      return resultScreen(s);
    case 'final':
      return finalScreen(s);
  }
}

let lastScreenKey = '';

export function render(): void {
  const s = ui.session;
  const key = `${ui.view}:${s?.screen}:${s?.game.round}:${s?.turn}:${ui.draft?.stage}:${ui.renaming}`;
  root().innerHTML = screenHtml() + (ui.rulesOpen ? rulesSheet() : '');
  document.body.classList.toggle('locked', ui.rulesOpen);
  if (key !== lastScreenKey) {
    window.scrollTo(0, 0);
    lastScreenKey = key;
  }
}

function ensureDraft(s: Session): Draft {
  const key = `${s.game.round}:${s.turn}`;
  if (ui.draft?.key === key) return ui.draft;
  const left = demandRemaining(s.game.agents[s.turn]!);
  const pickDemand = (reserved?: Demand) => ([2, 1, 3, 4] as const).find((d) => left[d] - (d === reserved ? 1 : 0) > 0) ?? 1;
  const slot = (demand: Demand): Slot => ({ playerId: null, clubId: null, demand, tactic: null, pass: false });
  const d1 = pickDemand();
  ui.draft = { key, stage: 1, slots: [slot(d1), slot(pickDemand(d1))] };
  return ui.draft;
}

/** 지금 편집 중인 차수의 슬롯 */
const cur = (): Slot => ui.draft!.slots[ui.draft!.stage - 1]!;

// ── 게임 흐름 ──────────────────────────────────────────

function beginBidding(game: GameState, base?: Session): Session {
  const humans = humansOf(game);
  return {
    game,
    subs: {},
    turn: humans[0] ?? 0,
    screen: humans.length > 1 ? 'handoff' : 'bid',
    recorded: base?.recorded ?? false,
  };
}

function startGame(seats: Seat[]) {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  ui.session = beginBidding(createGame(seats, seed));
  ui.draft = null;
  ui.view = 'game';
  persist();
}

function submit(sub: RoundSubmission) {
  const s = ui.session!;
  const subs = { ...s.subs, [s.turn]: sub };
  const nextHuman = humansOf(s.game).find((i) => !(i in subs));
  if (nextHuman !== undefined) {
    ui.session = { ...s, subs, turn: nextHuman, screen: 'handoff' };
  } else {
    ui.session = { ...s, game: resolveRound(s.game, subs), subs: {}, screen: 'result' };
  }
  ui.draft = null;
  persist();
}

function advance() {
  const s = ui.session!;
  const game = nextRound(s.game);
  if (game.phase === 'done') {
    ui.session = { ...s, game, screen: 'final' };
    record();
  } else {
    ui.session = beginBidding(game, s);
  }
  persist();
}

/** 기기 주인(0번 자리)의 전적 기록 */
function record() {
  const s = ui.session!;
  const p = ui.profile;
  if (s.recorded || !p) return;
  const me = rankings(s.game).find((r) => r.agent === 0)!;
  p.games++;
  if (me.rank === 1) p.wins++;
  p.total = Math.round((p.total + me.score) * 100) / 100;
  p.history = [{ at: Date.now(), score: me.score, rank: me.rank, agents: s.game.agents.length }, ...p.history].slice(0, 10);
  saveProfile(p);
  s.recorded = true;
}

// ── 액션 ───────────────────────────────────────────────

const actions: Record<string, (arg: string) => void> = {
  rules: () => (ui.rulesOpen = true),
  'rules-close': () => (ui.rulesOpen = false),

  register: () => {
    const input = document.getElementById('nick') as HTMLInputElement | null;
    const nick = (input?.value ?? '').replace(NICK_RE, '').slice(0, 12);
    if (nick.length < 2) return void (ui.error = '이름은 2자 이상이어야 합니다.');
    ui.profile = ui.profile ? { ...ui.profile, nick } : newProfile(nick);
    saveProfile(ui.profile);
    ui.renaming = false;
    ui.error = '';
  },
  rename: () => {
    ui.renaming = true;
    ui.error = '';
  },
  'rename-cancel': () => {
    ui.renaming = false;
    ui.error = '';
  },

  home: () => {
    ui.view = 'home';
    ui.error = '';
  },
  resume: () => {
    const s = ui.session;
    if (!s) return;
    // 이어하기 시 다른 사람의 화면이 노출되지 않도록 핫시트면 가림 화면부터
    if (s.screen === 'bid' && humansOf(s.game).length > 1) ui.session = { ...s, screen: 'handoff' };
    ui.view = 'game';
  },
  quit: () => {
    if (ui.session?.game.phase !== 'done' && !confirm('게임을 나갈까요? 홈에서 이어할 수 있습니다.')) return;
    ui.view = 'home';
  },
  new: () => {
    if (ui.session && ui.session.game.phase !== 'done' && !confirm('진행 중인 게임이 있습니다. 새로 시작할까요?')) return;
    ui.seats = [
      { name: ui.profile!.nick, kind: 'human' },
      { name: AI_NAMES[0]!, kind: 'ai', level: 'easy' },
    ];
    ui.error = '';
    ui.view = 'setup';
  },
  again: () => startGame(ui.session!.game.agents.map((a) => ({ name: a.name, kind: a.kind, ...(a.level ? { level: a.level } : {}) }))),

  'seat-add': (kind) => {
    if (ui.seats.length >= MAX_AGENTS) return;
    if (kind === 'ai') {
      const used = new Set(ui.seats.map((s) => s.name));
      ui.seats.push({ name: AI_NAMES.find((n) => !used.has(n)) ?? 'AI', kind: 'ai', level: 'easy' });
    } else {
      ui.seats.push({ name: `플레이어 ${ui.seats.filter((s) => s.kind === 'human').length + 1}`, kind: 'human' });
    }
  },
  'seat-level': (i) => {
    const s = ui.seats[Number(i)];
    if (s?.kind === 'ai') s.level = s.level === 'normal' ? 'easy' : 'normal';
  },
  'seat-del': (i) => {
    ui.seats.splice(Number(i), 1);
  },
  start: () => {
    const seats = ui.seats.map((s) => ({ ...s, name: cleanSeatName(s.name) }));
    if (seats.some((s) => s.name.length < 1)) return void (ui.error = '모든 플레이어 이름을 입력하세요.');
    if (new Set(seats.map((s) => s.name)).size !== seats.length) return void (ui.error = '이름이 겹치지 않게 해주세요.');
    ui.error = '';
    startGame(seats);
  },

  ready: () => {
    ui.session = { ...ui.session!, screen: 'bid' };
    persist();
  },
  stage: (k) => {
    if (ui.draft) ui.draft.stage = k === '2' ? 2 : 1;
  },
  pick: (id) => {
    cur().playerId = PLAYERS[Number(id)]!.id;
  },
  club: (id) => {
    cur().clubId = Number(id);
  },
  demand: (v) => {
    const n = Number(v);
    if (isDemand(n)) cur().demand = n;
  },
  tactic: (k) => {
    cur().tactic = (k || null) as TacticKey | null;
  },
  'slot-pass': () => {
    const d = ui.draft!;
    const sl = cur();
    sl.pass = !sl.pass;
    // 1차를 패스하면 바로 2차로
    if (sl.pass && d.stage === 1) d.stage = 2;
  },
  submit: () => {
    const [s1, s2] = ui.draft!.slots;
    const first = slotOffer(s1);
    const second = slotOffer(s2);
    if ((!s1.pass && !first) || (!s2.pass && !second)) return;
    if (!first && !second && !confirm('1차·2차 모두 패스할까요? 카드는 소모되지 않습니다.')) return;
    submit({ first, second });
  },
  next: () => advance(),
};

export function mount(): void {
  document.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const fn = actions[el.dataset.act!];
    if (!fn) return;
    fn(el.dataset.arg ?? '');
    render();
  });
  // 자리 이름 입력은 다시 그리지 않고 상태만 갱신 (키보드 유지)
  document.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.seat !== undefined) ui.seats[Number(el.dataset.seat)]!.name = el.value;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).id === 'nick') {
      actions.register!('');
      render();
    }
    if (e.key === 'Escape' && ui.rulesOpen) {
      ui.rulesOpen = false;
      render();
    }
  });
  render();
}
