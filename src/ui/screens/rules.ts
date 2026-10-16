import { CLUB_BONUS, EVENTS, EVENT_POOL, GUESS_BONUS, TOTAL_ROUNDS } from '../../core';

export function rulesSheet(): string {
  return `<div class="sheet-bg" data-act="rules-close"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="게임 규칙">
    <div class="sheet-h"><h3>📖 게임 규칙</h3><button class="icon" data-act="rules-close" aria-label="닫기">✕</button></div>
    <div class="sheet-b">
      <h4>한 줄 요약</h4><p>당신은 선수 에이전트이면서, 몰래 <b>한 구단의 이중 첩자</b>입니다. 계약 수수료를 벌면서 비밀 구단에 선수를 몰아 주되, 들키지 마세요.</p>
      <h4>준비</h4><p>구단 6곳을 펼칩니다. 각자 그중 한 곳이 적힌 <b>비밀 구단 카드</b>를 몰래 받고, <b>요구 수수료 카드 1·2·3·4억</b>을 받습니다.</p>
      <h4>라운드 (${TOTAL_ROUNDS}번)</h4><p>① 이벤트를 공개합니다(다음 라운드 이벤트도 예고). ② 시장에 선수를 <b>인원 + 1명</b>까지 채웁니다(지난 라운드에 남은 선수는 그대로). ③ 각자 <b>선수 1명, 구단 1곳, 요구 수수료 카드 1장</b>을 몰래 정해 동시에 공개합니다. 패스해도 됩니다.</p>
      <h4>계약</h4><p>구단 <b>제시액</b>이 선수 <b>몸값</b> 이상이어야 합니다. <b>매력도 = 포지션 일치(+2) + 선호 특성 일치(+1) − 요구 수수료.</b> 같은 선수를 노리면 매력도가 가장 높은 제안이 계약합니다. 최고 매력도가 같으면 <b>서로 상쇄되어 탈락</b>하고 그다음 제안이 계약합니다.</p>
      <h4>수수료</h4><p>수수료 = 선수 기본 수수료 + 요구 수수료(+이벤트). 계약한 선수 카드는 그 <b>구단 아래</b>에 놓습니다. 낸 요구 수수료 카드는 앞에 펼쳐 두고, 4장을 모두 쓰면 다시 가져옵니다.</p>
      <h4>공개 기록</h4><p>제안이 공개될 때마다 고른 구단 위에 내 색 큐브를 올립니다(계약 실패해도). 누가 어느 구단을 밀어 주는지 모두가 볼 수 있습니다.</p>
      <h4>게임 종료</h4><p>마지막 라운드 뒤 모두 동시에 <b>다른 에이전트의 비밀 구단을 하나씩 지목</b>합니다. 맞히면 <b>+${GUESS_BONUS}억</b>. 한 명에게라도 들킨 에이전트는 비밀 구단 보너스를 잃고, 들키지 않은 에이전트는 비밀 구단 아래 선수 <b>1명당 +${CLUB_BONUS}억</b>(누가 계약했든)을 받습니다. 합계가 가장 큰 사람이 승리합니다.</p>
      <h4>이벤트</h4><ul>${[...EVENT_POOL, 'deadline' as const].map((k) => `<li>${EVENTS[k].icon} <b>${EVENTS[k].name}</b> — ${EVENTS[k].desc}</li>`).join('')}</ul>
      <p class="mu">${EVENT_POOL.length}장 중 ${TOTAL_ROUNDS - 1}장을 무작위로 쓰고, 마지막 라운드는 항상 데드라인 데이입니다.</p>
    </div>
  </div>`;
}
