import { CAP, HOLE_COUNT, HOLE_LABELS, HOLE_NAMES, MAX_PLACE_PER_TURN, PLAYER_NAMES } from '../core/constants';
import { countColor, holeOwner, isFull, score, winner } from '../core/rules';
import type { GameState, Player } from '../core/types';
import type { GameController, View } from '../game/controller';
import { Board } from './board';
import { h, restartAnimation } from './dom';
import { brandMark, icon } from './icons';
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
  sub: HTMLElement;
}

interface PlayerCard {
  root: HTMLElement;
  score: HTMLElement;
  sub: HTMLElement;
  tag: HTMLElement;
}

const TOTAL_SEATS = CAP.reduce((a, b) => a + b, 0);

export class GameScreen {
  readonly el: HTMLElement;
  private board: Board;
  private cards: PlayerCard[];
  private segs: HTMLElement[];
  private tugLegend: HTMLElement;
  private lastScore: [number, number] = [-1, -1];
  private steps: HTMLElement;
  private stepEls: HTMLElement[];
  private statusTitle: HTMLElement;
  private statusDetail: HTMLElement;
  private statusEl: HTMLElement;
  /** 화면 낭독기용 알림 (진행 중 문구는 넣지 않는다) */
  private announcer: HTMLElement;
  private lastAnnounce = '';
  private actions: HTMLElement;
  private ticker: HTMLDetailsElement;
  private tickerText: HTMLElement;
  private actionBtns: HTMLElement;
  private dropsEl: HTMLElement;
  private drops: DropButton[];
  private endPlaceBtn: HTMLElement;
  private resultBtn: HTMLElement;
  private againBtn: HTMLElement;
  private log: HTMLElement;
  private net: HTMLElement;
  private netText: HTMLElement;
  private shareBtn: HTMLElement;
  private lastNetAnnounce = '';
  private result: HTMLElement | null = null;
  /** 결과 시트를 이미 띄운 판인가 (보드 보기로 닫은 뒤 다시 띄우지 않기 위함) */
  private resultShown = false;
  private unsubscribe: () => void;

  constructor(
    private c: GameController,
    private handlers: GameScreenHandlers,
  ) {
    this.board = new Board({ onHole: (i) => this.onHole(i) });
    this.cards = [0, 1].map((p) => this.makeCard(p as Player));
    this.segs = Array.from({ length: TOTAL_SEATS }, () => h('span', { class: 'seg' }));
    this.tugLegend = h('span');
    this.statusTitle = h('span', { class: 'status-title' });
    this.statusDetail = h('span', { class: 'status-detail' });

    this.stepEls = ['① 투입', '② 출발', '③ 유세'].map((t) => h('li', { text: t }));
    this.steps = h('ol', { class: 'steps', attrs: { 'aria-label': '턴 단계' } }, this.stepEls);

    // 행동 버튼은 한 번만 만들고 hidden/aria-disabled만 바꾼다 (포커스 유지)
    this.drops = ([0, 1] as const).map((c) => {
      const sub = h('span', { class: 'drop-sub' });
      const btn = h(
        'button',
        { class: `btn drop d${c}`, attrs: { type: 'button' }, onClick: () => this.c.act({ type: 'drop', color: c }) },
        [
          h('span', { class: `mark m${c} drop-tok`, attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'drop-text' }, [h('span', { text: `${PLAYER_NAMES[c]} 내리기` }), sub]),
        ],
      );
      return { btn, sub };
    });
    this.dropsEl = h('div', { class: 'drops' }, this.drops.map((d) => d.btn));
    this.endPlaceBtn = h('button', {
      class: 'btn gold',
      text: '투입 완료',
      attrs: { type: 'button' },
      onClick: () => this.c.act({ type: 'endPlace' }),
    });
    this.resultBtn = h('button', { class: 'btn', text: '결과', attrs: { type: 'button' }, onClick: () => this.openResult() });
    this.againBtn = h('button', { class: 'btn pri', text: '다시 하기', attrs: { type: 'button' }, onClick: () => this.handlers.onAgain() });
    this.actionBtns = h('div', { class: 'action-btns' }, [this.endPlaceBtn, this.resultBtn, this.againBtn]);

    this.log = h('ol', { class: 'log', attrs: { 'aria-label': '최근 진행' } });
    this.tickerText = h('span', { class: 'ticker-text' });
    this.ticker = h('details', { class: 'ticker' }, [
      h('summary', { attrs: { 'aria-label': '최근 진행 보기' } }, [
        h('span', { class: 'ticker-tag disp', text: '속보' }),
        this.tickerText,
        h('span', { class: 'ticker-chev' }, [icon('chevron', 18)]),
      ]),
      this.log,
    ]);
    this.actions = h('div', { class: 'actions' }, [this.ticker, this.dropsEl, this.actionBtns]);
    this.announcer = h('div', { class: 'sr-only', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });

    this.netText = h('span');
    this.shareBtn = h('button', {
      class: 'btn small',
      attrs: { type: 'button', 'aria-label': '방 코드 공유하기' },
      onClick: () => this.handlers.onShare?.(),
    }, [icon('share', 18), ' 초대']);
    this.shareBtn.style.display = 'inline-flex';
    this.shareBtn.style.alignItems = 'center';
    this.shareBtn.style.gap = '4px';
    this.net = h('div', { class: 'net' }, [
      h('span', { class: 'net-text' }, [h('span', { class: 'net-dot', attrs: { 'aria-hidden': 'true' } }), this.netText]),
      this.shareBtn,
    ]);
    this.net.hidden = c.mode !== 'online';

    const top = h('header', { class: 'topbar' }, [
      h('h1', { class: 'brand disp' }, [brandMark(), '유세 대작전']),
      c.mode === 'ai' && h('span', { class: 'mode-chip', text: 'AI 대결' }),
      handlers.themeButton,
      h('button', {
        class: 'icon-btn',
        attrs: { type: 'button', 'aria-label': '메뉴로 나가기' },
        onClick: handlers.onMenu,
      }, [icon('home')]),
    ]);
    const scoreboard = h('section', { class: 'scoreboard', attrs: { 'aria-label': '개표 현황' } }, [
      h('div', { class: 'score-cards' }, this.cards.map((x) => x.root)),
      h('div', { class: 'tug', attrs: { 'aria-hidden': 'true' } }, [
        h('div', { class: 'tug-bar' }, [...this.segs, h('span', { class: 'tug-mid' })]),
        h('div', { class: 'tug-legend' }, [h('span', { text: `선거인단 ${TOTAL_SEATS}석` }), this.tugLegend]),
      ]),
    ]);
    // 보이는 상태 줄은 live region이 아니다. 알림은 announcer가 맡는다.
    const status = h('p', { class: 'status', attrs: { tabindex: '-1' } }, [this.statusTitle, ' ', this.statusDetail]);
    this.statusEl = status;
    const turnbox = h('section', { class: 'turnbox' }, [this.steps, status]);
    const boardWrap = h('div', { class: 'board-wrap' }, [this.board.el]);
    const extra = h('div', { class: 'extra' }, [rulesDetails()]);

    this.el = h('main', { class: 'game' }, [top, this.net, scoreboard, turnbox, boardWrap, this.actions, extra, this.announcer]);
    this.unsubscribe = c.subscribe((v) => this.update(v));
  }

  /** 온라인 상태 줄 갱신 */
  setNet(info: NetInfo): void {
    const other = this.c.seat === 0 ? 1 : 0;
    const opp = info.online?.[other] ?? false;
    let text: string;
    let warn = false;
    if (info.status === 'connecting') text = `방 ${info.code}에 접속하는 중…`;
    else if (info.status === 'reconnecting') {
      text = '연결이 끊겨 다시 접속하는 중…';
      warn = true;
    } else if (info.status === 'closed') {
      text = '연결이 끊겼어요. 메뉴에서 다시 접속하세요.';
      warn = true;
    } else if (opp) text = `방 ${info.code} · 상대 접속 중`;
    else if (info.opponentSeen) {
      text = `방 ${info.code} · 상대 연결이 끊겼어요. 돌아오길 기다리는 중…`;
      warn = true;
    } else text = `방 코드 ${info.code} · 상대를 기다리는 중`;
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
    this.closeResult();
  }

  private who(p: Player): string {
    if (this.c.mode === 'ai') return p === this.c.aiPlayer ? 'AI' : '나';
    return p === this.c.seat ? '나' : '상대';
  }

  private makeCard(p: Player): PlayerCard {
    const score = h('b', { class: 'pscore disp' });
    const sub = h('small', { class: 'psub' });
    const mark = h('span', { class: `mark m${p}`, attrs: { 'aria-hidden': 'true' } });
    const name = p === 0 ? [mark, `${PLAYER_NAMES[p]} · ${this.who(p)}`] : [`${this.who(p)} · ${PLAYER_NAMES[p]}`, mark];
    const tag = h('span', { class: 'turn-tag', text: this.who(p) === '나' ? '내 차례' : `${this.who(p)} 차례` });
    const root = h('div', { class: `pcard p${p}` }, [
      tag,
      h('div', { class: 'pname' }, name),
      h('div', { class: 'pscore-row' }, [score, h('span', { class: 'pscore-unit', text: '표' })]),
      sub,
    ]);
    return { root, score, sub, tag };
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
      if (t[p] !== this.lastScore[p]) {
        card.score.textContent = String(t[p]);
        if (this.lastScore[p] >= 0) restartAnimation(card.score, 'bump');
      }
      card.sub.textContent = `예비군 ${s.reserves[p]}${s.phase === 'setup' ? ` · 배치 ${s.setupLeft[p]}` : ''}`;
    }
    this.lastScore = [t[0], t[1]];
    this.segs.forEach((el, k) => {
      const cls = k < t[0] ? 'seg s0' : k >= TOTAL_SEATS - t[1] ? 'seg s1' : 'seg';
      if (el.className !== cls) el.className = cls;
    });
    const undecided = TOTAL_SEATS - t[0] - t[1];
    setText(this.tugLegend, undecided > 0 ? `미확정 ${undecided}석` : '전 권역 확정');

    this.updateSteps(s);

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

    setText(this.tickerText, v.log[0] ?? '유세 시작!');
    this.log.replaceChildren(...v.log.map((line) => h('li', { text: line })));

    if (s.phase === 'over') {
      if (!this.resultShown && !v.busy) {
        this.resultShown = true;
        this.openResult();
      } else if (this.result) this.fillResult(s);
    } else {
      this.resultShown = false;
      this.closeResult();
    }
  }

  private updateSteps(s: GameState): void {
    const setup = s.phase === 'setup';
    const over = s.phase === 'over';
    this.steps.hidden = over;
    this.steps.classList.toggle('single', setup);
    const order = { place: 0, pick: 1, sow: 2 } as const;
    const cur = setup || over ? -1 : order[s.phase as keyof typeof order];
    const label = [`① 투입 ${Math.min(s.placedThisTurn + 1, MAX_PLACE_PER_TURN)}/${MAX_PLACE_PER_TURN}`, '② 출발', '③ 유세'];
    this.stepEls.forEach((li, k) => {
      li.hidden = setup && k > 0;
      const text = setup ? `사전 배치 · ${this.who(s.current)} 남은 ${s.setupLeft[s.current]}개` : k === 0 && cur !== 0 ? '① 투입' : label[k];
      setText(li, text);
      li.classList.toggle('on', setup ? k === 0 : k === cur);
      li.classList.toggle('done', !setup && k < cur);
      if (k === cur || (setup && k === 0)) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  private updateActions(v: View): void {
    const s = v.state;
    const can = this.c.canAct();
    const human = this.c.isHumanTurn();
    const focused = this.actions.contains(document.activeElement);

    const sow = s.phase === 'sow';
    this.ticker.hidden = sow;
    this.dropsEl.hidden = !sow;
    const blue = countColor(s.bus, 0);
    let shown = 0;
    for (const c of [0, 1] as const) {
      const d = this.drops[c];
      const n = c === 0 ? blue : s.bus.length - blue;
      d.btn.hidden = !sow || n === 0;
      if (!d.btn.hidden) shown++;
      setText(d.sub, `${n}명 남음`);
      d.btn.setAttribute('aria-label', `${PLAYER_NAMES[c]} 지지자 내리기, ${n}명 남음`);
      // 내 하차 사이의 짧은 진행 중에는 모양을 바꾸지 않고(깜빡임 방지) 입력만 막는다
      d.btn.setAttribute('aria-disabled', String(!can));
      d.btn.classList.toggle('off', !human);
    }
    this.dropsEl.classList.toggle('one', shown === 1);
    this.endPlaceBtn.hidden = !(s.phase === 'place' && can && s.placedThisTurn >= 1);
    const over = s.phase === 'over';
    this.resultBtn.hidden = !over;
    this.againBtn.hidden = !over;
    this.actionBtns.hidden = sow || (this.endPlaceBtn.hidden && !over);

    // 포커스가 있던 버튼이 사라졌으면 상태 줄로 옮긴다
    if (focused) {
      const a = document.activeElement;
      if (!(a instanceof HTMLElement) || a.offsetParent === null || !this.actions.contains(a)) this.statusEl.focus();
    }
  }

  // ---------- 개표 결과 시트 ----------

  private openResult(): void {
    if (this.result) return;
    const sheet = h('div', { class: 'sheet', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'result-title' } });
    const overlay = h('div', { class: 'result' }, [sheet]);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeResult(true);
    });
    sheet.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeResult(true);
    });
    this.result = overlay;
    this.fillResult(this.c.state);
    this.el.append(overlay);
    sheet.querySelector<HTMLElement>('.btn.pri')?.focus({ preventScroll: true });
  }

  private closeResult(refocus = false): void {
    if (!this.result) return;
    this.result.remove();
    this.result = null;
    if (refocus && !this.resultBtn.hidden) this.resultBtn.focus();
  }

  private fillResult(s: GameState): void {
    const sheet = this.result?.firstElementChild;
    if (!sheet) return;
    const t = score(s);
    const w = winner(s);
    const card = (p: Player) =>
      h('div', { class: `pcard p${p}${w === p ? ' win' : ''}` }, [
        h('div', { class: 'pname' }, p === 0
          ? [h('span', { class: 'mark m0', attrs: { 'aria-hidden': 'true' } }), `${PLAYER_NAMES[0]} · ${this.who(0)}`]
          : [`${this.who(1)} · ${PLAYER_NAMES[1]}`, h('span', { class: 'mark m1', attrs: { 'aria-hidden': 'true' } })]),
        h('div', { class: 'pscore-row' }, [h('b', { class: 'pscore disp', text: String(t[p]) }), h('span', { class: 'pscore-unit', text: '표' })]),
      ]);
    const segs = Array.from({ length: TOTAL_SEATS }, (_, k) =>
      h('span', { class: k < t[0] ? 'seg s0' : k >= TOTAL_SEATS - t[1] ? 'seg s1' : 'seg' }),
    );
    const rows = Array.from({ length: HOLE_COUNT }, (_, i) => {
      const g = s.holes[i];
      const b = countColor(g, 0);
      const o = holeOwner(s, i);
      const tie = g.length > 0 && b * 2 === g.length;
      return h('li', {}, [
        h('span', { class: 'dist-letter disp', text: HOLE_LABELS[i] }),
        h('span', { class: 'dist-name' }, [HOLE_NAMES[i], h('span', { class: 'dist-tally', text: g.length ? `${b} : ${g.length - b}${tie ? ' ⚑' : ''}` : '빈 권역' })]),
        h('span', { class: `dist-who w${o ?? 'n'}` }, o === null
          ? ['무효']
          : [h('span', { class: `mark m${o}`, attrs: { 'aria-hidden': 'true' } }), PLAYER_NAMES[o]]),
        h('span', { class: 'dist-cap disp', text: String(CAP[i]) }),
      ]);
    });
    const mine = this.c.mode === 'ai' ? (this.c.aiPlayer === 0 ? 1 : 0) : this.c.seat;
    const kicker = w === null ? '선거일 · 개표 완료' : w === mine ? '선거일 · 승리' : '선거일 · 패배';
    const tieNote =
      t[0] === t[1]
        ? h('p', { class: 'tie-note', text: `총점 동점 — 남은 예비군 ${s.reserves[0]} : ${s.reserves[1]}${w === null ? ', 무승부' : ` 로 ${PLAYER_NAMES[w]} 승리`}` })
        : null;
    const parts: (Node | null)[] = [
      h('div', { class: 'sheet-head' }, [
        h('div', {}, [
          h('span', { class: 'sheet-kicker', text: kicker }),
          h('h2', { class: `sheet-title disp${w === null ? '' : ` w${w}`}`, attrs: { id: 'result-title' } }, w === null
            ? ['무승부']
            : [`${PLAYER_NAMES[w]} 후보`, h('br'), '당선 확정']),
        ]),
        h('div', { class: `stamp disp ${w === null ? 'tie' : `w${w}`}`, text: w === null ? '동률' : '당선', attrs: { 'aria-hidden': 'true' } }),
      ]),
      h('div', { class: 'score-cards' }, [card(0), card(1)]),
      tieNote,
      h('div', { class: 'tug-bar tug-lg', attrs: { 'aria-hidden': 'true' } }, [...segs, h('span', { class: 'tug-mid' })]),
      h('ul', { class: 'dist', attrs: { 'aria-label': '권역별 결과' } }, rows),
      h('div', { class: 'sheet-btns' }, [
        h('button', { class: 'btn outline', text: '메뉴로', attrs: { type: 'button' }, onClick: () => this.handlers.onMenu() }),
        h('button', { class: 'btn pri', text: '다시 하기', attrs: { type: 'button' }, onClick: () => this.handlers.onAgain() }),
      ]),
      h('button', { class: 'sheet-peek', text: '보드 다시 보기', attrs: { type: 'button' }, onClick: () => this.closeResult(true) }),
    ];
    sheet.replaceChildren(...parts.filter((x): x is Node => x !== null));
  }
}

function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
