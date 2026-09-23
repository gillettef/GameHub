import { memo } from 'react';
import type { CardId } from '@astraltab/shared';
import { getSpec } from '@astraltab/shared';
import type { HandCardView } from '../game/derived';
import { CardFace } from './CardFace';
import styles from './Hand.module.css';

interface HandProps {
  cards: HandCardView[];
  selectedIndex: number | null;
  /** 내 턴이 아니면 어떤 카드도 고를 수 없다 (F009) */
  interactive: boolean;
  onSelect: (index: number | null) => void;
  /** 손패 소유자 좌석. 카드 배경을 좌석 색으로 물들인다 */
  seat?: number;
  /** 손패 교체 모드(F0xx, 2026-09-23): 배치 대신 "버릴 카드"를 여러 장 고른다. 낼 수 없는
   * 카드(에너지 부족 등)도 버릴 수는 있으므로 playable 여부와 무관하게 전부 선택 가능하다 */
  discardMode?: boolean;
  /** 고른 카드 id 다중 집합(순서 무관, 같은 카드 여러 장 가능) — index 가 아니라 cardId 로 추적한다.
   * 같은 이름 카드가 여럿이면 손패 순서상 앞쪽부터 골라진 것으로 그려진다(어느 카드나 얼굴이 같아
   * 사용자에게는 구분되지 않는다) */
  discardCardIds?: CardId[];
  onSetDiscard?: (cardId: CardId, willSelect: boolean) => void;
}

/** 보드 탭 하단 손패 (F009, F011). 낼 수 없는 카드는 음영 + 이유 */
export const Hand = memo(function Hand({
  cards,
  selectedIndex,
  interactive,
  onSelect,
  seat,
  discardMode,
  discardCardIds,
  onSetDiscard,
}: HandProps) {
  if (cards.length === 0) {
    return <p className={styles.empty}>손패가 비었습니다. 패스로 턴을 넘기세요.</p>;
  }
  return (
    <ul className={styles.list} aria-label="손패">
      {cards.map((c) => {
        if (discardMode) {
          // 같은 cardId 중 손패 순서상 몇 번째인지(rank)가 선택 개수보다 앞이면 선택된 것으로 그린다
          const rank = cards.filter((x) => x.cardId === c.cardId && x.index < c.index).length;
          const selectedCount = discardCardIds?.filter((id) => id === c.cardId).length ?? 0;
          const picked = rank < selectedCount;
          return (
            <li key={`${c.index}-${c.cardId}`}>
              <CardFace
                spec={getSpec(c.cardId)}
                selected={picked}
                reason={picked ? '버릴 카드로 골랐습니다' : null}
                onClick={interactive ? () => onSetDiscard?.(c.cardId, !picked) : undefined}
                seat={seat}
                compact
              />
            </li>
          );
        }
        const selectable = interactive && c.playable;
        return (
          <li key={`${c.index}-${c.cardId}`}>
            <CardFace
              spec={getSpec(c.cardId)}
              selected={selectedIndex === c.index}
              disabled={!selectable}
              reason={interactive ? c.reason : null}
              onClick={selectable ? () => onSelect(selectedIndex === c.index ? null : c.index) : undefined}
              seat={seat}
              compact
            />
          </li>
        );
      })}
    </ul>
  );
});
