import { MAX_AGENTS, MIN_AGENTS, PLAYERS, TOTAL_ROUNDS } from '../../core';
import type { RoundBid } from '../../core';
import type { NetState } from '../../online/client';
import type { RoomView, SeatView } from '../../online/protocol';
import { ICON, LEVEL_TEXT, clubById, dot, esc, header, type UiState } from '../view';

const STATUS_TEXT: Record<NetState['status'], string> = { idle: '', connecting: '서버에 연결 중…', open: '', closed: '연결이 끊겼습니다. 다시 연결하는 중…' };

export const connLine = (n: NetState): string => (STATUS_TEXT[n.status] ? `<p class="mu conn">📡 ${STATUS_TEXT[n.status]}</p>` : '');

/** 방 만들기 / 코드로 참가 */
export function onlineEntryScreen(ui: UiState, n: NetState): string {
  return `${header(`<span class="pill">${esc(ui.profile!.nick)}</span>`)}<main class="content">
    <h2 class="title">온라인 대전</h2>
    <p class="mu">각자 자기 휴대폰으로 접속해 ${MIN_AGENTS}~${MAX_AGENTS}명이 함께 합니다. 빈자리는 AI로 채울 수 있어요. 다른 사람의 제안과 비밀 구단은 서버가 가려서 보내 줍니다.</p>
    ${n.notice ? `<p class="card notice">${esc(n.notice)}</p>` : ''}
    <section class="card"><h3>방 만들기</h3>
      <p class="mu">방을 만들면 4자리 초대 코드가 나옵니다. 코드나 초대 링크를 친구에게 보내 주세요.</p>
      <button class="pri wide" data-act="on-create">방 만들기</button>
    </section>
    <section class="card"><h3>초대 코드로 참가</h3>
      <label class="lbl" for="room-code">초대 코드 (4자리)</label>
      <div class="split"><input id="room-code" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="예: K7Q2" enterkeyhint="go" value="${esc(ui.joinCode)}">
      <button class="pri" data-act="on-join">참가</button></div>
    </section>
    ${connLine(n)}
    <p class="err" role="alert">${esc(n.error)}</p>
  </main>
  <nav class="bar"><button data-act="home">홈으로</button></nav>`;
}

const crown = (r: RoomView, s: SeatView) => (s.pid && s.pid === r.host ? ' <span title="방장" aria-label="방장">👑</span>' : '');
const offline = (s: SeatView) => (s.kind === 'human' && !s.online ? ' <small class="err off">끊김</small>' : '');

/** 대기실: 자리·AI 추가·시작 */
export function roomLobbyScreen(r: RoomView, n: NetState, flash: string): string {
  const isHost = r.me === r.host;
  const full = r.seats.length >= MAX_AGENTS;
  const seats = r.seats
    .map((s, i) => {
      const me = s.pid === r.me;
      let ctl = '';
      if (me) ctl = '<span class="pill">나</span>';
      else if (isHost && s.kind === 'ai') ctl = `<button class="icon" data-act="on-remove" data-arg="${i}" aria-label="${esc(s.name)} 빼기">✕</button>`;
      else if (isHost && s.pid) ctl = `<button class="icon" data-act="on-kick" data-arg="${esc(s.pid)}" aria-label="${esc(s.name)} 내보내기">✕</button>`;
      const lv =
        s.kind === 'ai'
          ? isHost
            ? `<button class="lv ${s.level ?? 'normal'}" data-act="on-level" data-arg="${i}" aria-label="${esc(s.name)} 난이도: ${LEVEL_TEXT[s.level ?? 'normal']} (눌러서 변경)">${LEVEL_TEXT[s.level ?? 'normal']}</button>`
            : `<span class="lv ${s.level ?? 'normal'}">${LEVEL_TEXT[s.level ?? 'normal']}</span>`
          : '';
      return `<div class="seat"><span class="seat-ic">${s.kind === 'ai' ? '🤖' : '🧑‍💼'}</span><span class="seat-nm">${dot(i)}${esc(s.name)}${crown(r, s)}${offline(s)}</span>${lv}${ctl}</div>`;
    })
    .join('');
  const link = inviteLink(r.code);
  return `${header(`<span class="pill">방 <b>${esc(r.code)}</b></span>`)}<main class="content">
    <h2 class="title">대기실</h2>
    <section class="card invite"><span class="mu">초대 코드</span><b class="code" aria-label="초대 코드 ${esc(r.code)}">${[...r.code].map((ch) => `<span>${esc(ch)}</span>`).join('')}</b>
      <button data-act="on-share" class="wide">🔗 초대 링크 보내기</button>
      <small class="mu link-t">${esc(link)}</small>
      ${flash ? `<p class="ok-t">${esc(flash)}</p>` : ''}
    </section>
    <section class="card seats">${seats}</section>
    ${isHost ? `<button data-act="on-add-ai" class="wide" ${full ? 'disabled' : ''}>＋ AI 추가</button>` : ''}
    <p class="mu">${r.seats.length}/${MAX_AGENTS}명 (${MIN_AGENTS}~${MAX_AGENTS}인). ${isHost ? (r.seats.length < MIN_AGENTS ? `${MIN_AGENTS}명이 되도록 친구를 기다리거나 AI를 추가하세요.` : '모두 모이면 시작하세요.') : '방장이 게임을 시작할 때까지 기다려 주세요.'}</p>
    ${connLine(n)}
    <p class="err" role="alert">${esc(n.error)}</p>
  </main>
  <nav class="bar"><button data-act="on-leave">나가기</button>${isHost ? `<button class="pri" data-act="on-start" ${r.seats.length < MIN_AGENTS ? 'disabled' : ''}>게임 시작</button>` : ''}</nav>`;
}

export const inviteLink = (code: string): string => `${location.origin}${location.pathname}?room=${code}`;

/** 누가 끝냈는지 (사람만) */
export function progressList(r: RoomView): string {
  const isHost = r.me === r.host;
  return `<section class="card seats">${r.seats
    .map((s, i) => {
      if (s.kind === 'ai') return `<div class="seat"><span class="seat-ic">🤖</span><span class="seat-nm">${dot(i)}${esc(s.name)}</span><span class="mu">자동</span></div>`;
      const done = r.done.includes(i);
      const kick = isHost && s.pid !== r.me && !done ? `<button class="mini" data-act="on-kick" data-arg="${esc(s.pid ?? '')}" aria-label="${esc(s.name)} 자리를 AI에게 넘기기">AI로 교체</button>` : '';
      return `<div class="seat"><span class="seat-ic">${done ? '✅' : '⏳'}</span><span class="seat-nm">${dot(i)}${esc(s.name)}${crown(r, s)}${offline(s)}</span>${kick || `<span class="mu">${done ? '완료' : '작성 중'}</span>`}</div>`;
    })
    .join('')}</section>`;
}

const bidText = (b: RoundBid | null): string => {
  const one = (o: RoundBid['first']) => (o ? `${esc(PLAYERS[o.playerId]?.name ?? '?')} → ${esc(clubById(o.clubId)?.name ?? '?')} · 카드 ${o.demand}` : '패스');
  return b ? `<p class="mu">1차: ${one(b.first)}<br>2차: ${one(b.second)}</p>` : '';
};

/** 제출 뒤 다른 사람을 기다리는 화면 */
export function waitScreen(r: RoomView, n: NetState, gameHeader: string): string {
  const g = r.game!;
  const what = g.phase === 'guess' ? '지목을 제출했습니다' : `라운드 ${g.round}/${TOTAL_ROUNDS} 제안을 제출했습니다`;
  const humans = r.seats.filter((s) => s.kind === 'human').length;
  return `${gameHeader}<main class="content center">
    <div class="envelope small" aria-hidden="true"><span class="seal">${ICON.lock}</span></div>
    <h2 class="title">${what}</h2>
    ${g.phase === 'bid' ? bidText(r.myBid) : ''}
    <p class="mu">다른 에이전트를 기다리는 중… (${r.done.length}/${humans})</p>
    ${progressList(r)}
    ${connLine(n)}
    <p class="err" role="alert">${esc(n.error)}</p>
  </main>`;
}
