import { MAX_AGENTS, TOTAL_ROUNDS } from '../../core';
import { esc, header, money, type UiState } from '../view';

export function registerScreen(ui: UiState): string {
  return `${header()}<main class="content center">
    <section class="hero"><div class="hero-ic">⚽</div><h1>에이전트의 전쟁</h1>
      <p class="mu">5라운드 동안 선수 계약을 중개해<br>가장 많은 수수료를 버는 에이전트가 승리합니다.</p></section>
    <section class="card">
      <label class="lbl" for="nick">에이전트 이름 (2~12자)</label>
      <input id="nick" maxlength="12" autocomplete="nickname" placeholder="이름 입력" enterkeyhint="done" value="${esc(ui.profile?.nick ?? '')}">
      <p class="err">${esc(ui.error)}</p>
    </section>
  </main>
  <nav class="bar">${ui.renaming ? '<button data-act="rename-cancel">취소</button>' : ''}<button class="pri" data-act="register">${ui.renaming ? '저장' : '등록하고 시작'}</button></nav>`;
}

export function homeScreen(ui: UiState): string {
  const p = ui.profile!;
  const s = ui.session;
  const resume = s && s.game.phase !== 'done';
  const rate = p.games ? Math.round((p.wins / p.games) * 100) : 0;
  return `${header(`<span class="pill">${esc(p.nick)}</span>`)}<main class="content">
    <section class="hero small"><h1>에이전트의 전쟁</h1><p class="mu">AI 또는 친구와 한 기기로 3~${MAX_AGENTS}명</p></section>
    ${resume ? `<button class="card resume" data-act="resume"><span>진행 중인 게임</span><b>라운드 ${s.game.round}/${TOTAL_ROUNDS} 이어하기 →</b></button>` : ''}
    <section class="card"><h3>📊 내 전적</h3>
      <div class="stats"><div><small>플레이</small><b>${p.games}</b></div><div><small>승리</small><b>${p.wins}</b></div><div><small>승률</small><b>${rate}%</b></div><div><small>누적 수수료</small><b>${money(p.total)}</b></div></div>
    </section>
    <section class="card"><h3>🕘 최근 게임</h3>${
      p.history.length
        ? p.history
            .map((h) => `<div class="row"><span>${h.rank === 1 ? '🏆' : `${h.rank}위`} · ${h.agents}인전</span><span class="mu">${new Date(h.at).toLocaleDateString('ko-KR')}</span><b>${money(h.score)}</b></div>`)
            .join('')
        : '<p class="mu">아직 기록이 없습니다.</p>'
    }</section>
    <button class="link" data-act="rename">이름 바꾸기</button>
  </main>
  <nav class="bar"><button class="pri" data-act="new">새 게임</button></nav>`;
}
