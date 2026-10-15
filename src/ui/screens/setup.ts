import { MAX_AGENTS, MIN_AGENTS } from '../../core';
import { esc, header, type UiState } from '../view';

export function setupScreen(ui: UiState): string {
  const seats = ui.seats;
  const full = seats.length >= MAX_AGENTS;
  const humans = seats.filter((s) => s.kind === 'human').length;
  return `${header()}<main class="content">
    <h2 class="title">새 게임</h2>
    <p class="mu">사람이 2명 이상이면 한 기기를 돌려가며 플레이합니다. 차례마다 가림 화면이 나와요.</p>
    <section class="card seats">${seats
      .map(
        (s, i) => `<div class="seat">
          <span class="seat-ic">${s.kind === 'ai' ? '🤖' : '🧑‍💼'}</span>
          ${
            s.kind === 'ai'
              ? `<span class="seat-nm">${esc(s.name)}</span>`
              : `<input data-seat="${i}" maxlength="12" value="${esc(s.name)}" ${i === 0 ? 'readonly' : ''} aria-label="플레이어 ${i + 1} 이름">`
          }
          ${i === 0 ? '<span class="pill">나</span>' : `<button class="icon" data-act="seat-del" data-arg="${i}" aria-label="삭제">✕</button>`}
        </div>`,
      )
      .join('')}
    </section>
    <div class="split">
      <button data-act="seat-add" data-arg="human" ${full ? 'disabled' : ''}>＋ 사람</button>
      <button data-act="seat-add" data-arg="ai" ${full ? 'disabled' : ''}>＋ AI</button>
    </div>
    <p class="mu">${seats.length}/${MAX_AGENTS}명 · 사람 ${humans} · AI ${seats.length - humans}</p>
    <p class="err">${esc(ui.error)}</p>
  </main>
  <nav class="bar"><button data-act="home">취소</button><button class="pri" data-act="start" ${seats.length < MIN_AGENTS ? 'disabled' : ''}>게임 시작</button></nav>`;
}
