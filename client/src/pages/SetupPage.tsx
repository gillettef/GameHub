import { useEffect, useMemo, useState } from 'react';
import type { DeckChoice, MapId } from '@astraltab/shared';
import { DECK_SIZE, DEFAULT_MAP_ID, MAX_PLAYERS, MIN_PLAYERS, RACES, getMap, mapsForPlayers } from '@astraltab/shared';
import { DeckPicker, isCompleteChoice, type PartialChoice } from '../components/DeckPicker';
import { MapPicker } from '../components/MapPicker';
import { makeSeed } from '../game/hotseat';
import { cx } from '../lib/cx';
import { randomDeckChoice, randomMapId, shuffleIndices } from '../lib/randomPicks';
import { navigate } from '../lib/router';
import { useGameStore } from '../store/gameStore';
import landing from './LandingPage.module.css';
import styles from './SetupPage.module.css';

function deckTotal(c: PartialChoice): number {
  return Object.values(c.cards ?? {}).reduce((sum, n) => sum + n, 0);
}

/**
 * 핫시트 설정 화면 (비게임 세계): 참가 인원 → 맵 → 종족·덱 구성 → 닉네임 → 게임 시작.
 * 2026-09-22 사용자 지시로 한동안 전부 무작위 배정만 했으나(다시 뽑기로만 바꿀 수 있었다),
 * 2026-09-23 사용자 지시로 맵·종족·덱을 직접 고를 수 있는 화면으로 되돌렸다 — 참가 인원을 고르면
 * 무작위 기본값이 채워지고, 이후 맵 피커·덱 피커로 자유롭게 바꾸거나 "무작위" 버튼으로 다시 뽑을 수 있다.
 * 온라인 방은 RoomPage 의 로비가 맡는다.
 */
export function SetupPage({ onStart }: { onStart: () => void }) {
  const startHotseat = useGameStore((s) => s.startHotseat);
  const [playerCount, setPlayerCount] = useState(getMap(DEFAULT_MAP_ID).players);
  const [mapId, setMapId] = useState<MapId>(DEFAULT_MAP_ID);
  const [nicknames, setNicknames] = useState<string[]>(() => Array.from({ length: MAX_PLAYERS }, () => ''));
  const [choices, setChoices] = useState<PartialChoice[]>(() => Array.from({ length: MAX_PLAYERS }, () => randomDeckChoice()));
  const [error, setError] = useState<string | null>(null);

  const map = getMap(mapId);
  const seats = useMemo(() => Array.from({ length: map.players }, (_, i) => i), [map.players]);

  const randomizeAll = (n: number) => {
    setMapId(randomMapId(mapsForPlayers(n)));
    setChoices(Array.from({ length: n }, () => randomDeckChoice()));
  };

  // 처음 화면에 들어오면 한 번 무작위 배정한다 (그 뒤로는 아래 컨트롤로 자유롭게 바꾼다)
  useEffect(() => {
    randomizeAll(playerCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPlayerCount = (n: number) => {
    setPlayerCount(n);
    randomizeAll(n);
    setError(null);
  };

  const updateChoice = (i: number, next: PartialChoice) => {
    setChoices((prev) => prev.map((c, j) => (j === i ? next : c)));
    setError(null);
  };

  const start = () => {
    const incomplete = seats.find((i) => !isCompleteChoice(choices[i]));
    if (incomplete !== undefined) {
      setError(`플레이어 ${incomplete + 1}의 덱을 정확히 ${DECK_SIZE}장으로 구성해야 합니다`);
      return;
    }
    try {
      // 선턴이 유리하므로(덤으로 일부 보정하지만) 입력 순서 그대로 좌석을 주지 않고 무작위로 섞는다
      // (2026-09-23 사용자 지시: 선턴도 랜덤으로). 좌석 색·턴 순서는 이 시점에 정해진다.
      const order = shuffleIndices(seats.length);
      startHotseat({
        mapId,
        seed: makeSeed(),
        players: order.map((i) => ({
          nickname: nicknames[i]?.trim() || `플레이어 ${i + 1}`,
          deckChoice: choices[i] as DeckChoice,
        })),
      });
      onStart();
    } catch (e) {
      setError(e instanceof Error ? e.message : '게임을 시작하지 못했습니다');
    }
  };

  return (
    <div className={landing.root}>
      <header className={landing.hero}>
        <h1 className={landing.title}>핫시트</h1>
        <p className={landing.lead}>한 브라우저에서 번갈아 둡니다. 턴이 바뀌면 기기를 넘기는 화면이 손패를 가립니다.</p>
      </header>

      <main className={landing.main}>
        <section className={landing.section}>
          <h2 className={landing.h2}>1. 참가 인원</h2>
          <p className={landing.help}>같은 기기에서 번갈아 둘 인원.</p>
          <div className={styles.seatTabs} role="tablist" aria-label="참가 인원">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={playerCount === n}
                className={cx(styles.seatTab, playerCount === n && styles.seatTabActive)}
                onClick={() => pickPlayerCount(n)}
              >
                {n}명
              </button>
            ))}
          </div>
        </section>

        <section className={landing.section}>
          <div className={styles.sectionHead}>
            <h2 className={landing.h2}>2. 맵</h2>
            <button type="button" className="pill pill--outline" onClick={() => setMapId(randomMapId(mapsForPlayers(playerCount)))}>
              무작위
            </button>
          </div>
          <p className={landing.help}>{map.players}명이 들어가는 맵 중에서 고르세요.</p>
          <MapPicker value={mapId} onChange={setMapId} filterPlayers={playerCount} />
        </section>

        <section className={landing.section}>
          <h2 className={landing.h2}>3. 플레이어 {map.players}명</h2>
          <p className={landing.help}>
            닉네임을 비워 두면 "플레이어 N"으로 들어갑니다. 턴 순서(좌석)는 여기 입력 순서와 무관하게 게임 시작 시
            무작위로 정해집니다(2026-09-23: 선턴이 유리해 순서를 미리 정하지 않습니다). 종족·덱은 자유롭게 고르거나
            "무작위"로 다시 뽑으세요 — 덱은 카드마다 상한 이내로 정확히 {DECK_SIZE}장을 채워야 합니다.
          </p>
          <div className={styles.seatBlocks}>
            {seats.map((i) => {
              const choice = choices[i] ?? {};
              const race = choice.race ? RACES.find((r) => r.id === choice.race) : undefined;
              return (
                <div key={i} className={styles.seatBlock}>
                  <label className={styles.nameField}>
                    <span className={styles.seatLabel}>플레이어 {i + 1}</span>
                    <input
                      className={landing.input}
                      value={nicknames[i] ?? ''}
                      placeholder={`플레이어 ${i + 1}`}
                      maxLength={12}
                      onChange={(e) => setNicknames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                  </label>
                  <details className={styles.deckDetails}>
                    <summary className={styles.deckSummary}>
                      {race ? `종족 ${race.name} · 덱 ${deckTotal(choice)}/${DECK_SIZE}장` : '종족·덱 고르기'}
                      {isCompleteChoice(choice) ? '' : ' (미완성)'}
                    </summary>
                    <DeckPicker
                      choice={choice}
                      onPickRace={(r) => updateChoice(i, { race: r, cards: {} })}
                      onSetCount={(cardId, n) => updateChoice(i, { ...choice, cards: { ...choice.cards, [cardId]: Math.max(0, n) } })}
                      onRandom={() => updateChoice(i, randomDeckChoice())}
                    />
                  </details>
                </div>
              );
            })}
          </div>
        </section>

        <section className={cx(landing.section, styles.startBand)}>
          <div>
            <h2 className={styles.h2Light}>게임 시작</h2>
            <p className={styles.startHelp}>
              {map.name} · {map.players}명 · 준비 완료
            </p>
            {error && <p className={styles.error}>{error}</p>}
          </div>
          <div className={styles.startActions}>
            <button type="button" className="pill pill--outline" onClick={() => navigate('/')}>
              처음으로
            </button>
            <button type="button" className={cx('pill', 'pill--lg', styles.startButton)} onClick={start}>
              게임 시작
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
