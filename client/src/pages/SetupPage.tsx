import { useMemo, useState } from 'react';
import type { DeckChoice, MapId } from '@astraltab/shared';
import { DEFAULT_MAP_ID, MAX_PLAYERS, MIN_PLAYERS, getMap, mapsForPlayers } from '@astraltab/shared';
import { DeckPicker, isCompleteChoice, type PartialChoice } from '../components/DeckPicker';
import { MapPicker } from '../components/MapPicker';
import { makeSeed } from '../game/hotseat';
import { cx } from '../lib/cx';
import { randomDeckChoice, randomMapId } from '../lib/randomPicks';
import { navigate } from '../lib/router';
import { useGameStore } from '../store/gameStore';
import landing from './LandingPage.module.css';
import styles from './SetupPage.module.css';

/**
 * 핫시트 설정 화면 (비게임 세계): 맵 선택 → 닉네임 → 덱 빌딩(F016, F017) → 게임 시작.
 * 온라인 방은 RoomPage 의 로비가 맡는다.
 */
export function SetupPage({ onStart }: { onStart: () => void }) {
  const startHotseat = useGameStore((s) => s.startHotseat);
  const [playerCount, setPlayerCount] = useState(getMap(DEFAULT_MAP_ID).players);
  const [mapId, setMapId] = useState<MapId>(DEFAULT_MAP_ID);
  const [nicknames, setNicknames] = useState<string[]>(() => Array.from({ length: MAX_PLAYERS }, () => ''));
  const [choices, setChoices] = useState<PartialChoice[]>(() => Array.from({ length: MAX_PLAYERS }, () => ({})));
  const [activeSeat, setActiveSeat] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const map = getMap(mapId);
  const seats = useMemo(() => Array.from({ length: map.players }, (_, i) => i), [map.players]);
  const readySeats = seats.filter((i) => isCompleteChoice(choices[i]));
  const allReady = readySeats.length === map.players;

  const pickMap = (id: MapId) => {
    setMapId(id);
    if (activeSeat >= getMap(id).players) setActiveSeat(0);
    setError(null);
  };

  const pickPlayerCount = (n: number) => {
    setPlayerCount(n);
    if (getMap(mapId).players !== n) setMapId(mapsForPlayers(n)[0]!.id);
    setActiveSeat(0);
    setError(null);
  };

  const pick = (key: keyof DeckChoice, id: string) => {
    setChoices((prev) =>
      prev.map((c, i) => {
        if (i !== activeSeat) return c;
        const next = c[key] === id ? undefined : id;
        // 종족을 바꾸면(또는 해제하면) 이전 종족의 특수 카드 선택은 더 이상 유효하지 않다
        if (key === 'race') return { race: next as PartialChoice['race'] };
        return { ...c, [key]: next };
      }),
    );
  };

  const pickRandomDeck = () => {
    setChoices((prev) => prev.map((c, i) => (i === activeSeat ? randomDeckChoice() : c)));
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

  const active = choices[activeSeat] ?? {};

  return (
    <div className={landing.root}>
      <header className={landing.hero}>
        <h1 className={landing.title}>핫시트</h1>
        <p className={landing.lead}>한 브라우저에서 번갈아 둡니다. 턴이 바뀌면 기기를 넘기는 화면이 손패를 가립니다.</p>
      </header>

      <main className={landing.main}>
        <section className={landing.section}>
          <h2 className={landing.h2}>1. 참가 인원</h2>
          <p className={landing.help}>같은 기기에서 번갈아 둘 인원. 이 인원수의 맵만 아래에 나타납니다.</p>
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
            <button type="button" className="pill pill--outline" onClick={() => pickMap(randomMapId(mapsForPlayers(playerCount)))}>
              랜덤
            </button>
          </div>
          <MapPicker value={mapId} onChange={pickMap} filterPlayers={playerCount} />
        </section>

        <section className={landing.section}>
          <h2 className={landing.h2}>3. 플레이어 {map.players}명</h2>
          <p className={landing.help}>좌석 순서가 곧 턴 순서입니다. 비워 두면 "플레이어 N"으로 들어갑니다.</p>
          <div className={styles.names}>
            {seats.map((i) => (
              <label key={i} className={styles.nameField}>
                <span className={styles.seatLabel}>좌석 {i + 1}</span>
                <input
                  className={landing.input}
                  value={nicknames[i] ?? ''}
                  placeholder={`플레이어 ${i + 1}`}
                  maxLength={12}
                  onChange={(e) => setNicknames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                />
              </label>
            ))}
          </div>
        </section>

        <section className={landing.section}>
          <h2 className={landing.h2}>4. 덱 빌딩</h2>
          <p className={landing.help}>기본 덱은 전원 동일하고, 특수 카드를 건물·유닛·마법 종류별로 1장씩 고릅니다. 카드에 마우스를 올리면 상세 스펙이 보입니다.</p>
          <div className={styles.seatTabs} role="tablist" aria-label="덱을 고를 플레이어">
            {seats.map((i) => {
              const done = isCompleteChoice(choices[i]);
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
          <DeckPicker choice={active} onPick={pick} onRandom={pickRandomDeck} />
          <div className={styles.readyRow}>
            <button type="button" className="pill" disabled={!isCompleteChoice(active)} onClick={() => setActiveSeat((activeSeat + 1) % map.players)}>
              준비 완료 · 다음 플레이어
            </button>
            <span className={landing.help}>
              {isCompleteChoice(active) ? '세 장을 모두 골랐습니다.' : '건물·유닛·마법을 하나씩 고르면 준비 완료가 활성화됩니다.'}
            </span>
          </div>
        </section>

        <section className={cx(landing.section, styles.startBand)}>
          <div>
            <h2 className={styles.h2Light}>게임 시작</h2>
            <p className={styles.startHelp}>
              {allReady
                ? `${map.name} · ${map.players}명 · 준비 완료`
                : `준비 완료 ${readySeats.length} / ${map.players}명. 나머지 플레이어의 특수 카드를 고르세요.`}
            </p>
            {error && <p className={styles.error}>{error}</p>}
          </div>
          <div className={styles.startActions}>
            <button type="button" className="pill pill--outline" onClick={() => navigate('/')}>
              처음으로
            </button>
            <button type="button" className={cx('pill', 'pill--lg', styles.startButton)} disabled={!allReady} onClick={start}>
              게임 시작
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
