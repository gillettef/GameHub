import { memo, useMemo, type ReactNode } from 'react';
import { getSpec } from '@astraltab/shared';
import { CardFace } from '../components/CardFace';
import { buildHand, buildPlayerSummaries } from '../game/derived';
import { cx } from '../lib/cx';
import { selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './StatusTab.module.css';

/**
 * 상태 탭 (F010, F011): 플레이어별 에너지·수입·점수(영토/마커)·마커 수·손패·덱, 내 손패 상세, 덱·버린 카드.
 */
export const StatusTab = memo(function StatusTab() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);

  const rows = useMemo(() => (state ? buildPlayerSummaries(state) : []), [state]);
  const hand = useMemo(() => (state ? buildHand(state, viewerId) : []), [state, viewerId]);

  if (!state || !viewerId) return null;
  const me = state.players.find((p) => p.id === viewerId);
  if (!me) return null;

  const discardCounts = new Map<string, number>();
  for (const id of me.discard) discardCounts.set(id, (discardCounts.get(id) ?? 0) + 1);

  return (
    <div className={styles.root}>
      <section className={styles.panel} aria-label="플레이어 현황">
        <h2 className={styles.title}>플레이어</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>좌석</th>
              <th>닉네임</th>
              <th>에너지</th>
              <th>수입</th>
              <th>영토</th>
              <th>마커 점수</th>
              <th>덤</th>
              <th>합계</th>
              <th>마커</th>
              <th>손패</th>
              <th>덱</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cx(!r.alive && 'is-disabled', r.isCurrent && styles.current, r.id === viewerId && styles.me)}>
                <Cell label="좌석">
                  <span className={styles.seatDot} data-seat={r.seat} aria-hidden="true" />
                  {r.seat + 1}
                </Cell>
                <Cell label="닉네임" className={styles.name}>
                  {r.nickname}
                </Cell>
                <Cell label="에너지" className={styles.energy}>
                  {r.energy}
                </Cell>
                <Cell label="수입">+{r.income}</Cell>
                <Cell label="영토">{r.territory}</Cell>
                <Cell label="마커 점수">{r.markerScore}</Cell>
                <Cell label="덤" className={styles.muted}>
                  +{r.komi}
                </Cell>
                <Cell label="합계" className={styles.total}>
                  {r.total}
                </Cell>
                <Cell label="마커">{r.markerCount}</Cell>
                <Cell label="손패">{r.handCount}</Cell>
                <Cell label="덱">{r.deckCount}</Cell>
                <Cell label="상태">{!r.alive ? '탈락' : r.isCurrent ? '턴 진행 중' : r.passed ? '패스 중' : '대기'}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.panel} aria-label="내 손패">
        <h2 className={styles.title}>
          {me.nickname}의 손패 <span className={styles.sub}>{hand.length}장 · 에너지 {me.energy}</span>
        </h2>
        <ul className={styles.hand}>
          {hand.map((c) => (
            <li key={`${c.index}-${c.cardId}`}>
              <CardFace spec={getSpec(c.cardId)} disabled={!c.playable || !isMyTurn} reason={c.playable ? null : c.reason} seat={me.seat} />
            </li>
          ))}
          {hand.length === 0 && <li className={styles.muted}>손패가 비었습니다</li>}
        </ul>
      </section>

      <section className={styles.panel} aria-label="덱과 버린 카드">
        <h2 className={styles.title}>
          덱 <span className={styles.sub}>{rows.find((r) => r.id === viewerId)?.deckCount ?? me.deck.length}장 남음</span>
        </h2>
        <p className={styles.muted}>덱 순서는 공개되지 않습니다.</p>
        <h3 className={styles.subtitle}>이미 낸 카드 {me.discard.length}장</h3>
        {me.discard.length === 0 ? (
          <p className={styles.muted}>아직 낸 카드가 없습니다.</p>
        ) : (
          <ul className={styles.discard}>
            {[...discardCounts.entries()].map(([id, n]) => (
              <li key={id}>
                {getSpec(id).name} ×{n}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
});

/**
 * 표의 칸 하나. 데스크톱에서는 보통 `<td>`, 모바일(720px 이하)에서는 CSS로 `label: value` 한 줄짜리 카드 행으로 접힌다.
 * `data-label` 대신 실제 DOM에 라벨 텍스트를 넣어 모바일에서 값이 사라지는 레이아웃 버그를 피한다.
 */
function Cell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <td className={className}>
      <span className={styles.cellLabel}>{label}</span>
      <span className={styles.cellValue}>{children}</span>
    </td>
  );
}
