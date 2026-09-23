import { memo, type CSSProperties } from 'react';
import { ICONS } from '../components/CardFace';
import boardStyles from '../components/Board.module.css';
import { cx } from '../lib/cx';
import { keywordExplain, keywordLabel } from '../game/derived';
import styles from './HelpTab.module.css';

const SEATS = [0, 1, 2, 3];
const KEYWORDS = ['infiltrate', 'repair', 'overclock'];

const STATS: { icon: keyof typeof ICONS; label: string; desc: string }[] = [
  { icon: 'cost', label: '비용', desc: '배치에 필요한 에너지. 손패 카드·팝오버에 항상 보입니다.' },
  { icon: 'sight', label: '시야', desc: '이 마커를 중심으로 한 육각 거리 반경. 시야가 겹친 영역의 합집합이 배치 가능 범위이자 영토의 근거입니다.' },
  { icon: 'score', label: '점수', desc: '이 마커가 살아 있는 동안 더해지는 마커 점수. 파괴되면 즉시 사라집니다.' },
  { icon: 'hp', label: '체력', desc: '0 이하가 되면 파괴됩니다. 코어가 파괴되면 탈락합니다.' },
  { icon: 'attack', label: '공격', desc: '턴 시작 시 사거리 안 적 하나를 자동으로 공격합니다. 대상은 거리 → 체력 → y → x 순으로 정해집니다.' },
  { icon: 'range', label: '사거리', desc: '공격이 닿는 육각 거리.' },
  { icon: 'production', label: '생산', desc: '내 턴 수입 정산에서 코어 수입에 더해지는 양. 광맥 위 건물은 +1 추가됩니다.' },
];

const SHAPES: { kind: 'core' | 'building' | 'unit' | 'magic'; label: string; desc: string }[] = [
  { kind: 'core', label: '코어 · 육각', desc: '시작 지점. 파괴되면 탈락합니다. 종족과 무관하게 전 좌석 동일합니다.' },
  { kind: 'building', label: '건물 · 둥근 사각', desc: '이동하지 않는 고정 생산·방어 시설.' },
  { kind: 'unit', label: '유닛 · 원', desc: '전투·정찰용 마커. 역시 한 번 놓으면 이동하지 않습니다.' },
  { kind: 'magic', label: '마법 · 마름모', desc: '즉발 효과를 낸 뒤 사라지거나(피해·회복·에너지), 지속 효과를 내는 동안 마커로 남습니다.' },
];

/**
 * 설명 탭 (2026-09-23 사용자 지시: 하단 독 4번째 탭). 보드·카드에 쓰는 아이콘·모양·색의 뜻을
 * 한곳에 모아 둔다. 실제 렌더링에 쓰는 아이콘·CSS 클래스를 그대로 재사용해 표시가 어긋나지 않게 한다.
 */
export const HelpTab = memo(function HelpTab() {
  return (
    <div className={styles.root}>
      <section className={styles.panel}>
        <h2 className={styles.title}>마커 모양 · 색</h2>
        <p className={styles.help}>보드 위 마커는 항상 소유자의 좌석 색으로 채워지고, 모양으로 종류를 구분합니다.</p>
        <ul className={styles.legendList}>
          {SHAPES.map((s) => (
            <li key={s.kind} className={styles.legendRow}>
              <span className={styles.swatch} aria-hidden="true">
                <span className={boardStyles.marker} data-kind={s.kind} data-seat={0} />
              </span>
              <div>
                <strong className={styles.legendLabel}>{s.label}</strong>
                <p className={styles.legendDesc}>{s.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.title}>좌석 색</h2>
        <p className={styles.help}>좌석 순서가 턴 순서입니다. 네 색 모두 색각 이상에도 구분되도록 골랐습니다.</p>
        <ul className={styles.seatList}>
          {SEATS.map((seat) => (
            <li key={seat} className={styles.seatRow}>
              <span className={styles.seatDot} data-seat={seat} aria-hidden="true" />
              좌석 {seat + 1}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.title}>카드 스탯 아이콘</h2>
        <p className={styles.help}>손패 카드와 보드 마커 툴팁에서 같은 아이콘을 씁니다.</p>
        <ul className={styles.legendList}>
          {STATS.map((s) => (
            <li key={s.icon} className={styles.legendRow}>
              <span className={styles.iconSwatch} aria-hidden="true">
                {ICONS[s.icon]}
              </span>
              <div>
                <strong className={styles.legendLabel}>{s.label}</strong>
                <p className={styles.legendDesc}>{s.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.title}>키워드</h2>
        <ul className={styles.legendList}>
          {KEYWORDS.map((k) => (
            <li key={k} className={styles.legendRow}>
              <span className={cx(styles.tag)}>{keywordLabel(k)}</span>
              <p className={styles.legendDesc}>{keywordExplain(k)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.title}>지형</h2>
        <ul className={styles.legendList}>
          <li className={styles.legendRow}>
            <span className={styles.swatch} aria-hidden="true">
              <span className={boardStyles.hex} data-terrain="asteroid" />
            </span>
            <div>
              <strong className={styles.legendLabel}>소행성</strong>
              <p className={styles.legendDesc}>마커를 놓을 수 없습니다.</p>
            </div>
          </li>
          <li className={styles.legendRow}>
            <span className={styles.swatch} aria-hidden="true">
              <span className={boardStyles.hex} data-terrain="vein">
                <span className={boardStyles.vein} />
              </span>
            </span>
            <div>
              <strong className={styles.legendLabel}>광맥</strong>
              <p className={styles.legendDesc}>이 칸의 건물은 생산 +1을 더 받습니다.</p>
            </div>
          </li>
        </ul>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.title}>보드 오버레이</h2>
        <ul className={styles.legendList}>
          <li className={styles.legendRow}>
            <span className={styles.swatch} aria-hidden="true">
              <span className={boardStyles.hex} data-owner={0} />
            </span>
            <div>
              <strong className={styles.legendLabel}>영토 (색 채움)</strong>
              <p className={styles.legendDesc}>정확히 한 플레이어의 시야 안인 빈 칸·마커 칸. 1칸 1점입니다. 경합·소행성은 무소유(오버레이 없음).</p>
            </div>
          </li>
          <li className={styles.legendRow}>
            <span className={styles.swatch} style={{ '--sight-color': 'var(--color-seat-0)' } as CSSProperties} aria-hidden="true">
              <span className={boardStyles.hex} data-sight="" />
            </span>
            <div>
              <strong className={styles.legendLabel}>내 시야 (테두리 링)</strong>
              <p className={styles.legendDesc}>내 마커들의 시야가 닿는 칸. 카드를 고르면 이 안에서 배치 가능한 칸이 밝게 빛납니다.</p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
});
