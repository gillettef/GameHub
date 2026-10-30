// 카드 줄 9칸: 칸 아래에 지휘 비용 토큰(BGA 의 1·2·3 행동 표시)
import { useState, type CSSProperties } from 'react';
import type { CardDef, Ring } from '../../core/types';
import { CARD_DEFS } from '../../core/data/cards';
import { DOCTRINE_NAMES, slotCost } from '../../core/data/constants';
import { legacyTakeCost } from '../../core/engine/actions';
import { useGame } from '../useGame';
import { Icon } from './Icon';
import { Section } from './Section';
import { Sheet } from './Sheet';
import { instantText, modsText } from '../describe';
import styles from './CardRow.module.css';

export function cardText(c: CardDef): string {
  if (c.type === 'pioneer') return `${DOCTRINE_NAMES[c.doctrine]} 성향 · ${modsText(c.mods)}`;
  if (c.type === 'legacy') return `${c.stages.length}단계(생산 ${c.stages.join('·')}) · 완성 시 ${modsText(c.mods)} · ${c.points}점`;
  return instantText(c.instant);
}

export const CARD_TYPE_NAMES = { pioneer: '선구자', legacy: '유산', supply: '보급' };
const TONE = { pioneer: 'var(--accent)', legacy: 'var(--ring3)', supply: 'var(--res-prod)' };

export function CardRow() {
  const { game, me, check, act } = useGame();
  const [open, setOpen] = useState<number | null>(null);
  const p = game.players[me];
  const openId = open !== null ? game.cardRow[open] : null;
  const card = openId ? CARD_DEFS[openId] : null;
  const ring = Math.min(game.era, 3) as Ring;
  const costOf = (slot: number, c: CardDef) => (c.type === 'legacy' ? legacyTakeCost(p, slot) : slotCost(slot));
  return (
    <Section
      title={
        <>
          <Icon name="supply" /> 카드 줄
        </>
      }
      extra={`${ring}고리 덱 ${game.cardDecks[ring].length}장`}
    >
      <div className={styles.row}>
        {game.cardRow.map((id, slot) => {
          const c = id ? CARD_DEFS[id] : null;
          const cost = c ? costOf(slot, c) : slotCost(slot);
          if (!c) return <div key={slot} className={styles.empty} />;
          return (
            <button
              key={`${slot}-${id}`}
              className={`${styles.tile} anim-card-in`}
              style={{ '--delay': `${slot * 30}ms`, '--tone': TONE[c.type] } as CSSProperties}
              onClick={() => setOpen(slot)}
              aria-label={`${c.name}, ${CARD_TYPE_NAMES[c.type]}, 지휘 ${cost}`}
            >
              <span className={styles.tileHead}>
                <Icon name={c.type} size={14} />
                {CARD_TYPE_NAMES[c.type]}
              </span>
              <span className={styles.tileName}>{c.name}</span>
              <span className={styles.tileBody}>{cardText(c)}</span>
              <span className={styles.cost} aria-hidden="true">
                {Array.from({ length: cost }, (_, i) => (
                  <span key={i} className={styles.token} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {card && open !== null && (
        <Sheet
          title={card.name}
          onClose={() => setOpen(null)}
          actions={[
            {
              label: `가져오기 — 지휘 ${costOf(open, card)}`,
              onClick: () => act({ type: 'takeCard', slot: open }),
              disabled: check({ type: 'takeCard', slot: open }),
            },
          ]}
        >
          <p className={styles.dim}>
            {CARD_TYPE_NAMES[card.type]} · {card.ring}고리
          </p>
          <p>{cardText(card)}</p>
          {card.type === 'pioneer' && <p className={styles.dim}>가져오면 바로 내 선구자가 됩니다(기존 선구자는 버림). 한 시대에 한 명만.</p>}
          {card.type === 'legacy' && <p className={styles.dim}>가져오면 “짓는 중”. 단계마다 지휘 1 + 생산. 동시에 하나만.</p>}
          {card.type === 'supply' && <p className={styles.dim}>손에 들고 있다가 다음 차례부터 지휘 1로 사용.</p>}
          {card.text && <p className={styles.flavor}>“{card.text}”</p>}
        </Sheet>
      )}
    </Section>
  );
}
