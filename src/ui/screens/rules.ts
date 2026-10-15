import { TACTICS, TACTIC_KEYS } from '../../core';

export function rulesSheet(): string {
  return `<div class="sheet-bg" data-act="rules-close"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="게임 규칙">
    <div class="sheet-h"><h3>📖 게임 규칙</h3><button class="icon" data-act="rules-close" aria-label="닫기">✕</button></div>
    <div class="sheet-b">
      <h4>목표</h4><p>5라운드 동안 선수 계약을 성사시켜 수수료(억 원)를 가장 많이 모은 에이전트가 승리합니다.</p>
      <h4>진행</h4><p>매 라운드 선수 1명, 구단 1곳, 연봉, 수수료율 카드, (선택) 전략 카드를 정해 제출합니다. 모두 제출하면 결과가 한꺼번에 공개됩니다. 연봉은 선수의 최소 연봉 이상, 구단 예산 이하여야 합니다.</p>
      <h4>매력도와 경쟁</h4><p>매력도 = 연봉 + 포지션 일치(+2) + 구단 선호 특성(+1) + 전략 카드 + 이벤트. 같은 선수를 노리면 매력도가 높은 쪽이 계약하고, 동률이면 수수료율이 낮은 쪽, 그래도 같으면 무작위입니다.</p>
      <h4>수수료</h4><p>연봉 × 수수료율 + 선수 계약 보너스 ± 카드·이벤트 효과. 예) 연봉 8억 × 10% + 보너스 1억 = 1.8억</p>
      <h4>수수료율 카드</h4><p>5·10·15·20% 카드를 각 2장씩 받습니다. 제출하면 계약 성사 여부와 관계없이 소모됩니다. 패스하면 소모되지 않습니다.</p>
      <h4>전략 카드</h4><p>시작 시 무작위 3장, 라운드당 1장까지 쓸 수 있고 재사용할 수 없습니다.</p>
      <ul>${TACTIC_KEYS.map((k) => `<li><b>${TACTICS[k].name}</b> — ${TACTICS[k].desc}</li>`).join('')}</ul>
      <h4>이벤트</h4><p>매 라운드 시장 이벤트 하나가 모든 에이전트에게 적용됩니다: 공격수 품귀(FW 매력도 +1), 구단 긴축(예산 -1억), 유망주 열풍(유망주 수수료 +0.3억), 빅딜 시즌(최고 연봉 계약 +0.5억).</p>
    </div>
  </div>`;
}
