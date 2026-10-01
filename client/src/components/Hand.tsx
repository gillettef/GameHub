import { memo, useEffect, useRef, useState } from 'react';
import type { CardId } from '@astraltab/shared';
import { getSpec } from '@astraltab/shared';
import type { HandCardView } from '../game/derived';
import { CardMini } from './CardMini';
import styles from './Hand.module.css';

interface HandProps {
  cards: HandCardView[];
  selectedIndex: number | null;
  /** 내 턴일 때만 손패 교체(버릴 카드 고르기)를 할 수 있다. 확대 모달은 아무 때나 열 수 있다(F009) */
  interactive: boolean;
  /** 카드를 탭하면 선택하지 않고 확대 모달을 연다(2026-10-01). 고르기는 모달 안에서 한다 */
  onOpen: (index: number) => void;
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

/**
 * 보드 탭 하단 손패 (F009, F011). 2026-10-01 사용자 지시로 카드를 아이콘 위주의 작은 타일(CardMini)로 줄였다.
 * 낼 수 없는 카드는 흐리게 + 자물쇠, 새로 뽑은 카드는 아래에서 미끄러져 들어온다.
 */
export const Hand = memo(function Hand({ cards, selectedIndex, interactive, onOpen, seat, discardMode, discardCardIds, onSetDiscard }: HandProps) {
  // 손패가 늘어난 순간(드로우) 새로 들어온 카드만 한 번 애니메이션한다
  const prevLength = useRef(cards.length);
  const [freshFrom, setFreshFrom] = useState<number | null>(null);
  useEffect(() => {
    if (cards.length > prevLength.current) {
      setFreshFrom(prevLength.current);
      const t = window.setTimeout(() => setFreshFrom(null), 700);
      prevLength.current = cards.length;
      return () => window.clearTimeout(t);
    }
    prevLength.current = cards.length;
    return undefined;
  }, [cards.length]);

  if (cards.length === 0) {
    return <p className={styles.empty}>손패가 비었습니다. 패스로 턴을 넘기세요.</p>;
  }
  return (
    <ul className={styles.list} aria-label="손패">
      {cards.map((c) => {
        const spec = getSpec(c.cardId);
        const fresh = freshFrom !== null && c.index >= freshFrom;
        if (discardMode) {
          // 같은 cardId 중 손패 순서상 몇 번째인지(rank)가 선택 개수보다 앞이면 선택된 것으로 그린다
          const rank = cards.filter((x) => x.cardId === c.cardId && x.index < c.index).length;
          const selectedCount = discardCardIds?.filter((id) => id === c.cardId).length ?? 0;
          const picked = rank < selectedCount;
          return (
            <li key={`${c.index}-${c.cardId}`}>
              <CardMini
                spec={spec}
                picked={picked}
                seat={seat}
                fresh={fresh}
                onClick={interactive ? () => onSetDiscard?.(c.cardId, !picked) : undefined}
              />
            </li>
          );
        }
        return (
          <li key={`${c.index}-${c.cardId}`}>
            <CardMini
              spec={spec}
              selected={selectedIndex === c.index}
              locked={interactive && !c.playable}
              seat={seat}
              fresh={fresh}
              onClick={() => onOpen(c.index)}
            />
          </li>
        );
      })}
    </ul>
  );
});
