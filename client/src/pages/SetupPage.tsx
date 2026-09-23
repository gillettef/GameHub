import { useEffect, useMemo, useState } from 'react';
import type { DeckChoice, MapId } from '@astraltab/shared';
import { DEFAULT_MAP_ID, MAX_PLAYERS, MIN_PLAYERS, RACES, getMap, getSpec, mapsForPlayers } from '@astraltab/shared';
import { CardFace } from '../components/CardFace';
import { makeSeed } from '../game/hotseat';
import { cx } from '../lib/cx';
import { randomDeckChoice, randomMapId } from '../lib/randomPicks';
import { navigate } from '../lib/router';
import { useGameStore } from '../store/gameStore';
import landing from './LandingPage.module.css';
import styles from './SetupPage.module.css';

/**
 * 핫시트 설정 화면 (비게임 세계): 참가 인원 → 닉네임 → 게임 시작.
 * 맵·종족·특수 카드는 2026-09-23 사용자 지시로 플레이어가 직접 고르지 않고 전부 무작위 배정한다
 * ("다시 뽑기"로 전체를 한 번에 다시 무작위 배정할 수는 있다). 온라인 방은 RoomPage 의 로비가 맡는다.
 */
export function SetupPage({ onStart }: { onStart: () => void }) {
  const startHotseat = useGameStore((s) => s.startHotseat);
  const [playerCount, setPlayerCount] = useState(getMap(DEFAULT_MAP_ID).players);
  const [mapId, setMapId] = useState<MapId>(DEFAULT_MAP_ID);
  const [nicknames, setNicknames] = useState<string[]>(() => Array.from({ length: MAX_PLAYERS }, () => ''));
  const [choices, setChoices] = useState<DeckChoice[]>(() => Array.from({ length: MAX_PLAYERS }, () => randomDeckChoice()));
  const [error, setError] = useState<string | null>(null);

  const map = getMap(mapId);
  const seats = useMemo(() => Array.from({ length: map.players }, (_, i) => i), [map.players]);

  const randomizeAll = (n: number) => {
    setMapId(randomMapId(mapsForPlayers(n)));
    setChoices(Array.from({ length: n }, () => randomDeckChoice()));
  };

  // 처음 화면에 들어오면 한 번 무작위 배정한다
  useEffect(() => {
    randomizeAll(playerCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPlayerCount = (n: number) => {
    setPlayerCount(n);
    randomizeAll(n);
    setError(null);
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
            <h2 className={landing.h2}>2. 맵 · 종족 · 특수 카드</h2>
            <button type="button" className="pill pill--outline" onClick={() => randomizeAll(playerCount)}>
              다시 뽑기
            </button>
          </div>
          <p className={landing.help}>맵과 각 플레이어의 종족·특수 카드는 자동으로 무작위 배정됩니다. 마음에 안 들면 다시 뽑을 수 있습니다.</p>
          <div className={styles.mapCard}>
            <span className={styles.mapName}>{map.name}</span>
            <span className={styles.mapMeta}>
              {map.players}인 · {map.size}×{map.size} · {map.roundLimit}라운드
            </span>
            <span className={styles.mapDesc}>{map.description}</span>
          </div>
        </section>

        <section className={landing.section}>
          <h2 className={landing.h2}>3. 플레이어 {map.players}명</h2>
          <p className={landing.help}>좌석 순서가 곧 턴 순서입니다. 닉네임을 비워 두면 "플레이어 N"으로 들어갑니다.</p>
          <div className={styles.seatBlocks}>
            {seats.map((i) => {
              const choice = choices[i];
              const race = choice ? RACES.find((r) => r.id === choice.race) : undefined;
              return (
                <div key={i} className={styles.seatBlock}>
                  <label className={styles.nameField}>
                    <span className={styles.seatLabel}>좌석 {i + 1}</span>
                    <input
                      className={landing.input}
                      value={nicknames[i] ?? ''}
                      placeholder={`플레이어 ${i + 1}`}
                      maxLength={12}
                      onChange={(e) => setNicknames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                  </label>
                  {choice && race && (
                    <>
                      <span className={styles.seatRace}>
                        종족 <strong>{race.name}</strong> · {race.concept}
                      </span>
                      <div className={styles.seatCards}>
                        <CardFace spec={getSpec(choice.buildingId)} seat={i} hoverDetails />
                        <CardFace spec={getSpec(choice.unitId)} seat={i} hoverDetails />
                        <CardFace spec={getSpec(choice.magicId)} seat={i} hoverDetails />
                      </div>
                    </>
                  )}
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
