import { useMemo, useState } from 'react';
import type { CardType, DeckChoice, MapDef, MapId } from '@astraltab/shared';
import { BASE_CARDS, BASE_DECK_SIZE, DEFAULT_MAP_ID, MAPS, MAX_PLAYERS, getMap, specialCardsOf } from '@astraltab/shared';
import { CardFace } from '../components/CardFace';
import { makeSeed } from '../game/hotseat';
import { cx } from '../lib/cx';
import { useGameStore } from '../store/gameStore';
import styles from './SetupPage.module.css';

type PartialChoice = Partial<DeckChoice>;

const TYPES: { type: CardType; label: string; key: keyof DeckChoice }[] = [
  { type: 'building', label: '건물', key: 'buildingId' },
  { type: 'unit', label: '유닛', key: 'unitId' },
  { type: 'magic', label: '마법', key: 'magicId' },
];

function isComplete(c: PartialChoice): c is DeckChoice {
  return Boolean(c.buildingId && c.unitId && c.magicId);
}

/**
 * 핫시트 설정 화면 (비게임 세계): 맵 선택 → 닉네임 → 덱 빌딩(F016, F017) → 게임 시작.
 * Phase 2 의 로비(F002, F030)가 이 화면을 대체한다.
 */
export function SetupPage() {
  const startHotseat = useGameStore((s) => s.startHotseat);
  const [mapId, setMapId] = useState<MapId>(DEFAULT_MAP_ID);
  const [nicknames, setNicknames] = useState<string[]>(() => Array.from({ length: MAX_PLAYERS }, () => ''));
  const [choices, setChoices] = useState<PartialChoice[]>(() => Array.from({ length: MAX_PLAYERS }, () => ({})));
  const [activeSeat, setActiveSeat] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const map = getMap(mapId);
  const seats = useMemo(() => Array.from({ length: map.players }, (_, i) => i), [map.players]);
  const readySeats = seats.filter((i) => isComplete(choices[i] ?? {}));
  const allReady = readySeats.length === map.players;

  const pickMap = (m: MapDef) => {
    setMapId(m.id);
    if (activeSeat >= m.players) setActiveSeat(0);
    setError(null);
  };

  const pick = (seat: number, key: keyof DeckChoice, id: string) => {
    setChoices((prev) => prev.map((c, i) => (i === seat ? { ...c, [key]: c[key] === id ? undefined : id } : c)));
  };

  const start = () => {
    try {
      startHotseat({
        mapId,
        seed: makeSeed(),
        players: seats.map((i) => ({
          nickname: nicknames[i]?.trim() || `플레이어 ${i + 1}`,
          deckChoice: choices[i] as DeckChoice,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '게임을 시작하지 못했습니다');
    }
  };

  const active = choices[activeSeat] ?? {};
  const grouped = [2, 3, 4].map((n) => ({ n, maps: MAPS.filter((m) => m.players === n) }));

  return (
    <div className={styles.root}>
      <header className={styles.hero}>
        <h1 className={styles.title}>AstralTab</h1>
        <p className={styles.lead}>마커를 하나씩 놓아 영토를 넓히는 우주 전략 보드게임. 한 브라우저에서 번갈아 둡니다.</p>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.h2}>1. 맵</h2>
          <div className={styles.mapGroups}>
            {grouped.map((g) => (
              <div key={g.n} className={styles.mapGroup}>
                <h3 className={styles.h3}>{g.n}인</h3>
                {g.maps.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={cx(styles.mapCard, m.id === mapId && styles.mapSelected)}
                    aria-pressed={m.id === mapId}
                    onClick={() => pickMap(m)}
                  >
                    <span className={styles.mapName}>{m.name}</span>
                    <span className={styles.mapMeta}>
                      {m.size}×{m.size} · {m.roundLimit}라운드
                    </span>
                    <span className={styles.mapDesc}>{m.description}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>2. 플레이어 {map.players}명</h2>
          <p className={styles.help}>좌석 순서가 곧 턴 순서입니다. 비워 두면 "플레이어 N"으로 들어갑니다.</p>
          <div className={styles.names}>
            {seats.map((i) => (
              <label key={i} className={styles.nameField}>
                <span className={styles.seatLabel}>좌석 {i + 1}</span>
                <input
                  className={styles.input}
                  value={nicknames[i] ?? ''}
                  placeholder={`플레이어 ${i + 1}`}
                  maxLength={12}
                  onChange={(e) => setNicknames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                />
              </label>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>3. 덱 빌딩</h2>
          <p className={styles.help}>
            기본 덱 {BASE_DECK_SIZE}장은 전원 동일하고, 특수 카드를 건물·유닛·마법 종류별로 1장씩 고릅니다. 카드에 마우스를 올리면 상세 스펙이 보입니다.
          </p>
          <div className={styles.seatTabs} role="tablist" aria-label="덱을 고를 플레이어">
            {seats.map((i) => {
              const done = isComplete(choices[i] ?? {});
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={activeSeat === i}
                  className={cx(styles.seatTab, activeSeat === i && styles.seatTabActive)}
                  onClick={() => setActiveSeat(i)}
                >
                  {nicknames[i]?.trim() || `플레이어 ${i + 1}`}
                  <span className={cx(styles.seatState, done && styles.seatDone)}>{done ? '준비 완료' : '선택 중'}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.picker}>
            {TYPES.map((t) => (
              <div key={t.type} className={styles.pickColumn}>
                <h3 className={styles.h3}>
                  {t.label} 특수 카드 <span className={styles.h3sub}>1장 선택</span>
                </h3>
                <div className={styles.cards}>
                  {specialCardsOf(t.type).map((spec) => (
                    <CardFace
                      key={spec.id}
                      spec={spec}
                      selected={active[t.key] === spec.id}
                      onClick={() => pick(activeSeat, t.key, spec.id)}
                      hoverDetails
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.readyRow}>
            <button
              type="button"
              className="pill"
              disabled={!isComplete(active)}
              onClick={() => setActiveSeat((activeSeat + 1) % map.players)}
            >
              준비 완료{map.players > 1 ? ' · 다음 플레이어' : ''}
            </button>
            <span className={styles.help}>
              {isComplete(active) ? '세 장을 모두 골랐습니다.' : '건물·유닛·마법을 하나씩 고르면 준비 완료가 활성화됩니다.'}
            </span>
          </div>

          <details className={styles.baseDeck}>
            <summary className={styles.summary}>기본 덱 {BASE_DECK_SIZE}장 구성 보기</summary>
            <div className={styles.cards}>
              {BASE_CARDS.map((spec) => (
                <div key={spec.id} className={styles.baseCard}>
                  <CardFace spec={spec} hoverDetails />
                  <span className={styles.copies}>×{spec.copies}</span>
                </div>
              ))}
            </div>
          </details>
        </section>

        <section className={cx(styles.section, styles.startBand)}>
          <div>
            <h2 className={styles.h2Light}>게임 시작</h2>
            <p className={styles.startHelp}>
              {allReady
                ? `${map.name} · ${map.players}명 · 준비 완료`
                : `준비 완료 ${readySeats.length} / ${map.players}명. 나머지 플레이어의 특수 카드를 고르세요.`}
            </p>
            {error && <p className={styles.error}>{error}</p>}
          </div>
          <button type="button" className={cx('pill', 'pill--lg', styles.startButton)} disabled={!allReady} onClick={start}>
            게임 시작
          </button>
        </section>
      </main>
    </div>
  );
}
