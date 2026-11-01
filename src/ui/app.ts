import { score } from '../core/rules';
import type { GameState, Player } from '../core/types';
import { GameController } from '../game/controller';
import {
  clearGame,
  clearRoom,
  clientId,
  loadGame,
  loadRoom,
  loadTheme,
  saveGame,
  saveRoom,
  saveTheme,
  type SavedGame,
  type ThemePref,
} from '../game/storage';
import { OnlineConnection, type FatalReason } from '../net/online';
import { ROOM_TTL_MS, isRoomCode, normalizeRoomCode, randomRoomCode, type ServerMsg } from '../net/protocol';
import { h } from './dom';
import { GameScreen, type NetInfo } from './gameScreen';
import { rulesDetails } from './rules';

function resumeScore(saved: SavedGame): string {
  if (saved.state.phase === 'setup') return '배치 중';
  const t = score(saved.state);
  return `🔵 ${t[0]} : ${t[1]} 🔴`;
}

const THEME_LABEL: Record<ThemePref, string> = { auto: '🌓 자동', light: '☀️ 밝게', dark: '🌙 어둡게' };
const NEXT_THEME: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' };

const FATAL_TEXT: Record<FatalReason, (code: string) => string> = {
  notFound: (c) => `방 ${c}을(를) 찾을 수 없어요. 코드를 확인해 주세요. (24시간 동안 쓰지 않은 방은 사라져요)`,
  taken: (c) => `방 ${c}을(를) 만들 수 없어요. 다시 시도해 주세요.`,
  full: (c) => `방 ${c}은(는) 이미 두 사람이 들어가 있어요.`,
  badRequest: () => '접속 요청이 올바르지 않아요. 다시 시도해 주세요.',
  replaced: () => '다른 탭이나 기기에서 이 방에 접속해서 이 화면의 연결을 넘겼어요.',
};

const API_ORIGIN: string | undefined = import.meta.env.VITE_API_ORIGIN || undefined;

/** 암호학적 난수 [0, 1) — 방 코드용 */
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

interface OnlineSession {
  code: string;
  conn: OnlineConnection;
  net: NetInfo;
  /** 방 만들기 중 코드가 겹쳐 다시 시도한 횟수 */
  createTries: number;
}

export class App {
  private controller: GameController | null = null;
  private screen: GameScreen | null = null;
  private online: OnlineSession | null = null;
  private theme: ThemePref = loadTheme();

  constructor(private root: HTMLElement) {
    this.applyTheme();
  }

  showMenu(notice?: string): void {
    this.teardown();
    const saved = loadGame();
    const room = loadRoom(ROOM_TTL_MS);
    const codeInput = h('input', {
      class: 'code-input',
      attrs: {
        type: 'text',
        inputmode: 'text',
        autocomplete: 'off',
        autocapitalize: 'characters',
        spellcheck: 'false',
        maxlength: '6',
        placeholder: '방 코드',
        'aria-label': '참가할 방 코드',
      },
    });
    const joinForm = h('form', { class: 'join-row' }, [
      codeInput,
      h('button', { class: 'btn', text: '참가', attrs: { type: 'submit' } }),
    ]);
    joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = normalizeRoomCode(codeInput.value);
      if (!isRoomCode(code)) {
        this.showMenu('방 코드는 4글자예요. (예: K7QM)');
        return;
      }
      this.startOnline(code, false);
    });

    const menu = h('main', { class: 'menu' }, [
      h('header', { class: 'topbar' }, [
        h('h1', { class: 'title' }, ['🗳️ 유세 대작전 ', h('small', { text: '대통령 선거 만칼라' })]),
        h('div', { class: 'topbar-buttons' }, [this.themeButton()]),
      ]),
      notice
        ? h('p', { class: 'status notice', text: notice, attrs: { role: 'alert' } })
        : h('p', { class: 'status intro', text: '두 후보가 6개 권역을 도는 유세 버스로 지지자를 모읍니다. 포화 권역이 4곳이 되면 선거일!' }),
      saved &&
        h('button', { class: 'btn pri big', attrs: { type: 'button' }, onClick: () => this.startAi(saved) }, [
          `▶ 이어하기 `,
          h('small', { text: `(AI 대결 · ${resumeScore(saved)})` }),
        ]),
      h('button', {
        class: `btn big${saved ? '' : ' pri'}`,
        text: '🤖 AI와 대결 (선공 무작위)',
        attrs: { type: 'button' },
        onClick: () => this.startAi(),
      }),
      h('section', { class: 'online-panel', attrs: { 'aria-labelledby': 'online-title' } }, [
        h('h2', { class: 'panel-title', text: '🌐 온라인 대결', attrs: { id: 'online-title' } }),
        room &&
          h('button', { class: 'btn big', attrs: { type: 'button' }, onClick: () => this.startOnline(room.code, false) }, [
            `▶ 방 ${room.code} 다시 접속`,
          ]),
        h('button', { class: 'btn big', attrs: { type: 'button' }, onClick: () => this.createRoom() }, [
          '방 만들기 ',
          h('small', { text: '(선공 무작위)' }),
        ]),
        joinForm,
        h('small', { class: 'hint', text: '방을 만든 뒤 "초대" 버튼으로 링크나 코드를 상대에게 보내세요.' }),
      ]),
      rulesDetails(!saved && !notice),
    ]);
    this.root.replaceChildren(menu);
  }

  startAi(saved?: SavedGame): void {
    this.teardown();
    if (!saved) clearGame();
    // 새 판마다 내 색(🔵 선공 / 🔴 후공)을 무작위로 정한다
    const aiPlayer: Player = saved?.aiPlayer ?? (Math.random() < 0.5 ? 0 : 1);
    const c = new GameController({
      mode: 'ai',
      aiPlayer,
      state: saved?.state,
      log: saved?.log ?? [`🎲 순서 추첨: 나 = ${aiPlayer === 1 ? '🔵 선공' : '🔴 후공'}`],
      onSettled: (x) => saveGame({ mode: 'ai', aiPlayer, state: x.state, log: [...x.logLines] }),
    });
    this.mount(c, () => this.startAi());
    c.start();
  }

  createRoom(tries = 0): void {
    this.startOnline(randomRoomCode(secureRandom), true, tries);
  }

  /** 온라인 방에 접속. 첫 welcome을 받으면 게임 화면을 연다 */
  startOnline(code: string, create: boolean, createTries = 0): void {
    this.teardown();
    if (!navigator.onLine) {
      this.showMenu('온라인 대결은 인터넷 연결이 필요해요.');
      return;
    }
    const net: NetInfo = { code, status: 'connecting', online: null, opponentSeen: false };
    const conn = new OnlineConnection(
      { code, clientId: clientId(), create, origin: API_ORIGIN },
      {
        onMessage: (m) => this.onServer(m),
        onStatus: (status, reason) => {
          net.status = status;
          if (status === 'closed' && reason) this.onFatal(reason);
          else this.screen?.setNet(net);
        },
      },
    );
    this.online = { code, conn, net, createTries };
    this.root.replaceChildren(
      h('main', { class: 'menu' }, [
        h('header', { class: 'topbar' }, [h('h1', { class: 'title' }, ['🗳️ 유세 대작전'])]),
        h('p', { class: 'status', text: `🌐 방 ${code}에 접속하는 중…`, attrs: { role: 'status' } }),
        h('button', { class: 'btn big', text: '취소', attrs: { type: 'button' }, onClick: () => this.showMenu() }),
      ]),
    );
    conn.connect();
  }

  // ---------- 온라인 내부 ----------

  private onServer(m: ServerMsg): void {
    const o = this.online;
    if (!o) return;
    switch (m.t) {
      case 'welcome':
        saveRoom(o.code);
        if (m.full) o.net.opponentSeen = true;
        this.setPresence(m.online, m.seat);
        if (this.controller && this.controller.seat === m.seat) this.controller.resync(m.state);
        else this.openOnlineGame(m.seat, m.state);
        break;
      case 'presence':
        if (this.controller) this.setPresence(m.online, this.controller.seat);
        break;
      case 'action':
        this.controller?.remoteAction(m.action, m.from);
        break;
      case 'state':
        this.controller?.resync(m.state);
        break;
      case 'error':
        break; // 곧 연결이 닫히고 onStatus('closed', code)로 처리된다
    }
  }

  private setPresence(online: [boolean, boolean], seat: Player): void {
    const o = this.online;
    if (!o) return;
    o.net.online = online;
    if (online[seat === 0 ? 1 : 0]) o.net.opponentSeen = true;
    this.screen?.setNet(o.net);
  }

  private openOnlineGame(seat: Player, state: GameState): void {
    const o = this.online;
    if (!o) return;
    this.screen?.destroy();
    this.controller?.dispose();
    const c = new GameController({
      mode: 'online',
      seat,
      state,
      sendAction: (action, from) => o.conn.send({ t: 'action', action, from }),
      onDesync: () => o.conn.send({ t: 'sync' }),
    });
    this.mount(c, () => o.conn.send({ t: 'again' }), () => this.share(o.code));
    this.screen?.setNet(o.net);
    c.start();
  }

  private onFatal(reason: FatalReason): void {
    const o = this.online;
    if (!o) return;
    if (reason === 'taken' && !this.controller && o.createTries < 3) {
      this.createRoom(o.createTries + 1); // 코드가 겹침 → 새 코드로
      return;
    }
    if (reason === 'notFound' || reason === 'full') clearRoom();
    if (this.screen && reason !== 'notFound') {
      this.screen.setNet(o.net); // 게임 화면은 남겨 두고 연결 끊김만 표시
      return;
    }
    this.showMenu(FATAL_TEXT[reason](o.code));
  }

  private async share(code: string): Promise<void> {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', code);
    const text = `🗳️ 유세 대작전 한 판 해요! 방 코드: ${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: '유세 대작전', text, url: url.toString() });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      window.alert(`초대 링크를 복사했어요.\n방 코드: ${code}`);
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return; // 공유 창을 닫음
      window.prompt('아래 링크를 상대에게 보내세요.', url.toString());
    }
  }

  // ---------- 공통 ----------

  private mount(c: GameController, onAgain: () => void, onShare?: () => void): void {
    this.controller = c;
    this.screen = new GameScreen(c, {
      onMenu: () => this.showMenu(),
      onAgain,
      onShare,
      themeButton: this.themeButton(),
    });
    this.root.replaceChildren(this.screen.el);
  }

  private teardown(): void {
    this.screen?.destroy();
    this.controller?.dispose();
    this.online?.conn.close();
    this.screen = null;
    this.controller = null;
    this.online = null;
  }

  private themeButton(): HTMLButtonElement {
    const b = h('button', {
      class: 'btn small',
      text: THEME_LABEL[this.theme],
      attrs: { type: 'button', 'aria-label': `화면 테마: ${THEME_LABEL[this.theme]} (눌러서 변경)` },
    });
    b.addEventListener('click', () => {
      this.theme = NEXT_THEME[this.theme];
      saveTheme(this.theme);
      this.applyTheme();
      b.textContent = THEME_LABEL[this.theme];
      b.setAttribute('aria-label', `화면 테마: ${THEME_LABEL[this.theme]} (눌러서 변경)`);
    });
    return b;
  }

  private applyTheme(): void {
    const el = document.documentElement;
    if (this.theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', this.theme);
    const dark =
      this.theme === 'dark' || (this.theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#16171a' : '#f6f4ef'));
  }
}
