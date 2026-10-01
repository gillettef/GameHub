import { memo, useEffect, type ReactNode } from 'react';
import { RACES, getSpec } from '@astraltab/shared';
import type { CardSpec } from '@astraltab/shared';
import { CardArt } from '../game/cardArt';
import { cardImageUrl } from '../game/cardImage';
import { buildHand, effectExplain, keywordExplain, keywordLabel, kindLabel } from '../game/derived';
import { RaceArt } from '../game/raceArt';
import { selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { effectLabel, ICONS } from './CardFace';
import { CheckIcon, CloseIcon, LockIcon, PlaceIcon } from './icons';
import styles from './CardModal.module.css';

function statList(spec: CardSpec): { key: string; icon: ReactNode; value: string; label: string }[] {
  const list: { key: string; icon: ReactNode; value: string; label: string }[] = [
    { key: 'sight', icon: ICONS.sight, value: String(spec.sight), label: '시야' },
  ];
  if (spec.kind !== 'magic') list.push({ key: 'score', icon: ICONS.score, value: String(spec.score), label: '점수' });
  if (spec.hp > 0) list.push({ key: 'hp', icon: ICONS.hp, value: String(spec.hp), label: '체력' });
  if (spec.attack > 0) list.push({ key: 'attack', icon: ICONS.attack, value: String(spec.attack), label: '공격' });
  if (spec.range > 0) list.push({ key: 'range', icon: ICONS.range, value: String(spec.range), label: '사거리' });
  if (spec.production > 0) list.push({ key: 'production', icon: ICONS.production, value: `+${spec.production}`, label: '생산' });
  // 즉발 마법은 마커로 남지 않아 시야·점수가 의미 없다
  return spec.kind === 'magic' && spec.sight === 0 ? list.filter((s) => s.key !== 'sight') : list;
}

/**
 * 카드 확대 모달 (2026-10-01 사용자 지시): 손패 카드를 탭하면 선택하지 않고 먼저 크게 보여 준다.
 * 모달 안에서 고르기를 눌러야 카드가 선택되고(= 배치 가능 칸 표시) 모달이 닫힌다. 낼 수 없는 카드나
 * 상대 차례에는 이유만 보여 주고 고르기가 잠긴다. 카드 탭의 카탈로그 카드도 같은 모달로 본다(보기 전용).
 */
export const CardModal = memo(function CardModal() {
  const target = useGameStore((s) => s.cardModal);
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const selectedIndex = useGameStore((s) => s.selectedHandIndex);
  const close = useGameStore((s) => s.closeCardModal);
  const selectHandCard = useGameStore((s) => s.selectHandCard);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, close]);

  if (!target || !state) return null;

  let spec: CardSpec;
  let reason: string | null = null;
  let canSelect = false;
  let isSelected = false;
  let handIndex: number | null = null;
  if (target.kind === 'hand') {
    const view = buildHand(state, viewerId).find((c) => c.index === target.index);
    if (!view) return null;
    spec = getSpec(view.cardId);
    handIndex = view.index;
    isSelected = selectedIndex === view.index;
    canSelect = isMyTurn && view.playable;
    reason = !isMyTurn ? '상대 차례입니다. 내 차례에 고를 수 있습니다' : view.playable ? null : view.reason;
  } else {
    spec = getSpec(target.cardId);
  }

  const image = cardImageUrl(spec.id);
  const race = spec.race ? RACES.find((r) => r.id === spec.race) : null;
  const effect = effectLabel(spec);
  const explain = effectExplain(spec);

  return (
    <div className={styles.backdrop} onClick={close} role="dialog" aria-modal="true" aria-label={`${spec.name} 카드`}>
      <div className={styles.card} data-kind={spec.kind} onClick={(e) => e.stopPropagation()}>
        <div className={styles.art}>
          {image ? <img src={image} alt="" draggable={false} /> : <CardArt cardId={spec.id} className={styles.glyph} />}
          <span className={styles.cost} title="비용">
            <span className={styles.costIcon}>{ICONS.cost}</span>
            {spec.cost}
          </span>
        </div>
        <div className={styles.body}>
          <h2 className={styles.name}>
            <CardArt cardId={spec.id} className={styles.nameIcon} />
            {spec.name}
          </h2>
          <p className={styles.meta}>
            {kindLabel(spec.kind)}
            {race && (
              <>
                {' · '}
                <RaceArt raceId={race.id} className={styles.raceIcon} />
                {race.name}
              </>
            )}
          </p>
          <ul className={styles.stats}>
            {statList(spec).map((s) => (
              <li key={s.key} className={styles.stat} title={s.label} aria-label={`${s.label} ${s.value}`}>
                <span className={styles.statIcon}>{s.icon}</span>
                {s.value}
              </li>
            ))}
          </ul>
          <p className={styles.desc}>{spec.description}</p>
          {effect && (
            <p className={styles.desc}>
              <b>{effect}</b>
              {explain && ` — ${explain}`}
            </p>
          )}
          {spec.keywords.length > 0 && (
            <ul className={styles.keywords}>
              {spec.keywords.map((k) => (
                <li key={k}>
                  <b>{keywordLabel(k)}</b> {keywordExplain(k).replace(/^[^:]+:\s*/, '')}
                </li>
              ))}
            </ul>
          )}
        </div>
        {reason && (
          <p className={styles.reason}>
            <LockIcon size={14} /> {reason}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.close} onClick={close} aria-label="닫기" title="닫기">
            <CloseIcon />
          </button>
          {handIndex !== null && (
            <button
              type="button"
              className={styles.pick}
              disabled={!canSelect && !isSelected}
              onClick={() => {
                selectHandCard(isSelected ? null : handIndex);
                close();
              }}
              aria-label={isSelected ? '선택 해제' : '이 카드 고르기'}
              title={isSelected ? '선택 해제' : '이 카드 고르기'}
            >
              {isSelected ? <CheckIcon /> : <PlaceIcon />}
              <span>{isSelected ? '선택됨 · 해제' : '고르기'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
