import { PLAYER_NAMES } from '../core/constants';
import { countColor, fullCount, isFull, score } from '../core/rules';
import type { Player } from '../core/types';
import type { GameController, View } from '../game/controller';
import { Board } from './board';
import { h } from './dom';
import { rulesDetails } from './rules';
import { statusText } from './text';
import type { ConnStatus } from '../net/online';

export interface GameScreenHandlers {
  onMenu(): void;
  onAgain(): void;
  /** 방 코드 공유 (online 모드) */
  onShare?(): void;
  themeButton: HTMLElement;
}

/** 온라인 접속 정보 (online 모드에서 App이 넣어 준다) */
export interface NetInfo {
  code: string;
  status: ConnStatus;
  /** 서버가 알려 준 자리별 접속 여부. 아직 모르면 null */
  online: [boolean, boolean] | null;
  /** 상대가 한 번이라도 들어왔는가 */
  opponentSeen: boolean;
}

interface DropButton {
  btn: HTMLButtonElement;
  label: Text;
}

interface PlayerCard {
  root: HTMLElement;
  score: HTMLElement;
  sub: HTMLElement;
}

export class GameScreen {
  readonly el: HTMLElement;
  private board: Board;
  private cards: PlayerCard[];
  private fullEl: HTMLElement;
  private statusTitle: HTMLElement;
  private statusDetail: HTMLElement;
  private statusEl: HTMLElement;
  /** 화면 낭독기용 알림 (진행 중 문구는 넣지 않는다) */
  private announcer: HTMLElement;
  private lastAnnounce = '';
  private actions: HTMLElement;
  private busLabel: HTMLElement;
  private drops: DropButton[];
  private endPlaceBtn: HTMLElement;
  private againBtn: HTMLElement;
  private menuBtn: HTMLElement;
  private log: HTMLElement;
  private net: HTMLElement;
  private netText: HTMLElement;
  private shareBtn: HTMLElement;
  private lastNetAnnounce = '';
  private unsubscribe: () => void;

  constructor(
    private c: GameController,
    private handlers: GameScreenHandlers,
  ) {
    this.board = new Board({ onHole: (i) => this.onHole(i) });
    this.cards = [0, 1].map((p) => this.makeCard(p as Player));
    this.fullEl = h('b');
    this.statusTitle = h('b');
    this.statusDetail = h('span');
    // 행동 버튼은 한 번만 만들고 hidden/aria-disabled만 바꾼다 (포커스 유지)
    this.busLabel = h('span', { class: 'bus-label', text: '🚌 하차' });
    this.drops = ([0, 1] as const).map((c) => {
      const label = document.createTextNode('');
      const btn = h(
        'button',
        { class: `btn drop d${c}`, attrs: { type: 'button' }, onClick: () => this.c.act({ type: 'drop', color: c }) },
        [h('span', { class: `mark m${c}`, attrs: { 'aria-hidden': 'true' } }), label],
      );
      return { btn, label };
    });
    this.endPlaceBtn = h('button', { class: 'btn pri', text: '투입 완료 →', attrs: { type: 'button' }, onClick: () => this.c.act({ type: 'endPlace' }) });
    this.againBtn = h('button', { class: 'btn pri', text: '다시 하기', attrs: { type: 'button' }, onClick: () => this.handlers.onAgain() });
    this.menuBtn = h('button', { class: 'btn', text: '메뉴로', attrs: { type: 'button' }, onClick: () => this.handlers.onMenu() });
    this.actions = h('div', { class: 'actions' }, [
      this.busLabel,
      ...this.drops.map((d) => d.btn),
      this.endPlaceBtn,
      this.againBtn,
      this.menuBtn,
    ]);
    this.announcer = h('div', { class: 'sr-only', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    this.log = h('ol', { class: 'log', attrs: { 'aria-label': '최근 진행' } });
    this.netText = h('span', { class: 'net-text' });
    this.shareBtn = h('button', {
      class: 'btn small',
      text: '📨 초대',
      attrs: { type: 'button', 'aria-label': '방 코드 공유하기' },
      onClick: () => this.handlers.onShare?.(),
    });
    this.net = h('div', { class: 'net' }, [this.netText, this.shareBtn]);
    this.net.hidden = c.mode !== 'online';

    const top = h('header', { class: 'topbar' }, [
      h('h1', { class: 'title' }, ['🗳️ 유세 대작전']),
      h('div', { class: 'topbar-buttons' }, [
        handlers.themeButton,
        h('button', { class: 'btn small', text: '메뉴', attrs: { type: 'button' }, onClick: handlers.onMenu }),
      ]),
    ]);
    const scoreboard = h('section', { class: 'scoreboard', attrs: { 'aria-label': '점수판' } }, [
      this.cards[0].root,
      h('div', { class: 'mid' }, [h('span', { text: '포화' }), this.fullEl]),
      this.cards[1].root,
    ]);
    // 보이는 상태 줄은 live region이 아니다. 알림은 announcer가 맡는다.
    const status = h('div', { class: 'status', attrs: { tabindex: '-1' } }, [this.statusTitle, ' ', this.statusDetail]);
    this.statusEl = status;
    const boardWrap = h('div', { class: 'board-wrap' }, [this.board.el]);
    const extra = h('div', { class: 'extra' }, [this.log, rulesDetails()]);

    this.el = h('main', { class: 'game' }, [top, this.net, scoreboard, status, boardWrap, this.actions, extra, this.announcer]);
    this.unsubscribe = c.subscribe((v) => this.update(v));
  }

  /** 온라인 상태 줄 갱신 */
  setNet(info: NetInfo): void {
    const other = this.c.seat === 0 ? 1 : 0;
    const opp = info.online?.[other] ?? false;
    let text: string;
    let warn = false;
    if (info.status === 'connecting') text = `🌐 방 ${info.code}에 접속하는 중…`;
    else if (info.status === 'reconnecting') {
      text = '⚠️ 연결이 끊겨 다시 접속하는 중…';
      warn = true;
    } else if (info.status === 'closed') {
      text = '⚠️ 연결이 끊겼어요. 메뉴에서 다시 접속하세요.';
      warn = true;
    } else if (opp) text = `🌐 방 ${info.code} · 상대 접속 중`;
    else if (info.opponentSeen) {
      text = `🌐 방 ${info.code} · 상대 연결이 끊겼어요. 돌아오길 기다리는 중…`;
      warn = true;
    } else text = `🌐 방 코드 ${info.code} · 상대를 기다리는 중`;
    setText(this.netText, text);
    this.net.classList.toggle('warn', warn);
    this.shareBtn.hidden = info.status !== 'open' || opp || info.opponentSeen;
    if (text !== this.lastNetAnnounce) {
      this.lastNetAnnounce = text;
      this.announcer.textContent = text;
    }
  }

  destroy(): void {
    this.unsubscribe();
  }

  private makeCard(p: Player): PlayerCard {
    const tag =
      this.c.mode === 'ai' ? (p === this.c.aiPlayer ? ' (AI)' : ' (나)') : p === this.c.seat ? ' (나)' : ' (상대)';
    const score = h('b', { class: 'pscore' });
    const sub = h('small', { class: 'psub' });
    const root = h('div', { class: `pcard p${p}` }, [
      h('div', { class: 'pname' }, [h('span', { class: `mark m${p}`, attrs: { 'aria-hidden': 'true' } }), `${PLAYER_NAMES[p]}${tag}`]),
      h('div', {}, [score, h('span', { text: '표' })]),
      sub,
      h('span', { class: 'turn-tag', text: '차례' }),
    ]);
    return { root, score, sub };
  }

  private onHole(i: number): void {
    const s = this.c.state;
    if (s.phase === 'setup' || s.phase === 'place') this.c.act({ type: s.phase, hole: i });
    else if (s.phase === 'pick') this.c.act({ type: 'pick', hole: i });
  }

  private selectable(i: number): boolean {
    if (!this.c.canAct()) return false;
    const s = this.c.state;
    if (s.phase === 'setup' || s.phase === 'place') return !isFull(s, i);
    if (s.phase === 'pick') return s.holes[i].length > 0;
    return false;
  }

  private update(v: View): void {
    const s = v.state;
    const t = score(s);
    for (const p of [0, 1] as const) {
      const card = this.cards[p];
      card.root.classList.toggle('on', s.current === p && s.phase !== 'over');
      card.score.textContent = String(t[p]);
      card.sub.textContent = `예비군 ${s.reserves[p]}${s.phase === 'setup' ? ` · 배치 ${s.setupLeft[p]}` : ''}`;
    }
    this.fullEl.textContent = `${fullCount(s)}/4`;

    const st = statusText(v, { aiPlayer: this.c.aiPlayer, seat: this.c.seat });
    setText(this.statusTitle, st.title);
    setText(this.statusDetail, st.detail);
    // 사람 차례의 '이동 중…' 같은 과도 문구는 읽지 않는다 (AI 차례 문구는 한 번 읽힌다)
    const transient = v.busy && this.c.isHumanTurn();
    const msg = `${st.title} ${st.detail}`.trim();
    if (!transient && msg !== this.lastAnnounce) {
      this.lastAnnounce = msg;
      this.announcer.textContent = msg;
    }

    this.board.update(v, (i) => this.selectable(i));
    this.updateActions(v);

    this.log.replaceChildren(...v.log.map((line) => h('li', { text: line })));
  }

  private updateActions(v: View): void {
    const s = v.state;
    const can = this.c.canAct();
    const human = this.c.isHumanTurn();
    const focused = this.actions.contains(document.activeElement);

    const sow = s.phase === 'sow';
    this.busLabel.hidden = !sow;
    const blue = countColor(s.bus, 0);
    for (const c of [0, 1] as const) {
      const d = this.drops[c];
      const n = c === 0 ? blue : s.bus.length - blue;
      d.btn.hidden = !sow || n === 0;
      setText(d.label, `${PLAYER_NAMES[c]} ×${n}`);
      d.btn.setAttribute('aria-label', `${PLAYER_NAMES[c]} 지지자 내리기, ${n}명 남음`);
      // 내 하차 사이의 짧은 진행 중에는 모양을 바꾸지 않고(깜빡임 방지) 입력만 막는다
      d.btn.setAttribute('aria-disabled', String(!can));
      d.btn.classList.toggle('off', !human);
    }
    this.endPlaceBtn.hidden = !(s.phase === 'place' && can && s.placedThisTurn >= 1);
    const over = s.phase === 'over';
    this.againBtn.hidden = !over;
    this.menuBtn.hidden = !over;

    // 포커스가 있던 버튼이 사라졌으면 상태 줄로 옮긴다
    if (focused) {
      const a = document.activeElement;
      if (!(a instanceof HTMLElement) || a.hidden || !this.actions.contains(a)) this.statusEl.focus();
    }
  }
}

function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
