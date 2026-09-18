import { useState } from 'react';
import { cards } from '@server/engine/cards';
import type { SponsorContract } from '@server/engine/types';
import type { PlayerPublicView } from '@server/engine/view';
import { billboardLimit } from '@server/engine/weekday';
import { CONTRACT_LABEL } from '../labels';
import { SponsorCardView } from './Cards';
import { EffectChips } from './Icons';

// 스폰서 계약 모달 (룰북 p.18): 카드 1장을 고른 뒤 계약 유형을 고른다.
// - 장내 방송(참조표의 스폰서키트): 효과를 즉시 적용하고 카드를 버린다. 장수 제한 없음.
// - 광고판: 카드를 광고판 칸에 둔다(기본 2장, 3번 광고판을 지으면 3장). 카드 효과 또는 추가 보너스 중 하나.
// - 유니폼(참조표의 스타디움 명명권): 카드를 스타디움 보드 왼쪽에 뒤집어 둔다(1장). 효과와 추가 보너스를 모두 받는다.
// 이미 최대 수만큼 계약한 유형은 고를 수 없고, 부정적인 효과라도 항상 모두 적용된다.

export interface ContractChoice {
  contract: SponsorContract;
  billboardChoice?: 'effect' | 'bonus';
}

export function SponsorContractModal({ cardId, me, onClose, onSign }: { cardId: string; me: PlayerPublicView; onClose: () => void; onSign: (choice: ContractChoice) => void }) {
  const card = cards.sponsor(cardId);
  const [choice, setChoice] = useState<ContractChoice | null>(null);
  const billboards = me.sponsors.billboards.length;
  const limit = billboardLimit(me);
  const billboardFull = billboards >= limit;
  const namingTaken = !!me.sponsors.naming;
  const is = (c: SponsorContract, b?: 'effect' | 'bonus') => !!choice && choice.contract === c && (c !== 'billboard' || choice.billboardChoice === b);

  const option = (key: string, active: boolean, disabled: boolean, onPick: () => void, body: React.ReactNode) => (
    <button key={key} type="button" className={`contract-option${active ? ' selected' : ''}`} disabled={disabled} aria-pressed={active} onClick={onPick}>
      {body}
    </button>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sponsor-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="스폰서 계약">
        <div className="panel-head">
          <h2>스폰서 계약 — {card.name}</h2>
          <span className="muted small">계약 유형을 고르고 확정하세요</span>
        </div>
        <div className="sponsor-modal-body">
          <SponsorCardView cardId={cardId} />
          <div className="contract-options">
            {option(
              'kit',
              is('kit'),
              false,
              () => setChoice({ contract: 'kit' }),
              <>
                <span className="contract-title">
                  {CONTRACT_LABEL.kit} <span className="muted small">제한 없음</span>
                </span>
                <span className="contract-desc">효과를 바로 적용하고 카드는 버립니다.</span>
                <EffectChips effects={card.kit} />
              </>,
            )}
            <div className={`contract-group${billboardFull ? ' disabled' : ''}`}>
              <span className="contract-title">
                {CONTRACT_LABEL.billboard} <span className="muted small">{billboards}/{limit}장{limit < 3 && ' · 3번 광고판을 지으면 1장 더'}</span>
              </span>
              <span className="contract-desc">{billboardFull ? '광고판 칸이 가득 찼습니다.' : '카드를 광고판 칸에 둡니다. 카드 효과와 추가 보너스 중 하나만 받습니다.'}</span>
              <div className="contract-sub">
                {option(
                  'billboard-effect',
                  is('billboard', 'effect'),
                  billboardFull,
                  () => setChoice({ contract: 'billboard', billboardChoice: 'effect' }),
                  <>
                    <span className="contract-sub-label">카드 효과</span>
                    <EffectChips effects={card.billboard} />
                  </>,
                )}
                {option(
                  'billboard-bonus',
                  is('billboard', 'bonus'),
                  billboardFull,
                  () => setChoice({ contract: 'billboard', billboardChoice: 'bonus' }),
                  <>
                    <span className="contract-sub-label">추가 보너스</span>
                    <EffectChips effects={card.extraBonus} />
                  </>,
                )}
              </div>
            </div>
            {option(
              'naming',
              is('naming'),
              namingTaken,
              () => setChoice({ contract: 'naming' }),
              <>
                <span className="contract-title">
                  {CONTRACT_LABEL.naming} <span className="muted small">{namingTaken ? '이미 계약함' : '1장'}</span>
                </span>
                <span className="contract-desc">카드를 스타디움 보드 왼쪽에 뒤집어 둡니다. 효과와 추가 보너스를 모두 받습니다.</span>
                <span className="chips">
                  <EffectChips effects={card.naming} />
                  <span className="plus">+</span>
                  <EffectChips effects={card.extraBonus} />
                </span>
              </>,
            )}
          </div>
        </div>
        <p className="muted small">부정적인 효과라도 항상 모두 적용됩니다. 계약 후 남은 스폰서 카드는 오른쪽으로 밀리고 왼쪽이 보충됩니다. (규칙서 p.18)</p>
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>취소</button>
          <button className="primary" disabled={!choice} onClick={() => choice && onSign(choice)}>
            {choice ? `${CONTRACT_LABEL[choice.contract]}${choice.billboardChoice ? (choice.billboardChoice === 'bonus' ? ' (추가 보너스)' : ' (카드 효과)') : ''} 계약 확정` : '계약 유형을 고르세요'}
          </button>
        </div>
      </div>
    </div>
  );
}
