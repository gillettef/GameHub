import { useEffect, useMemo, useState } from 'react';
import type { MapId, RaceId } from '@astraltab/shared';
import { DEFAULT_MAP_ID, MAX_PLAYERS, MIN_PLAYERS, RACES, getMap, mapsForPlayers } from '@astraltab/shared';
import { DeckPicker } from '../components/DeckPicker';
import { DockShell } from '../components/DockShell';
import { MapPicker } from '../components/MapPicker';
import type { SetupDockTab } from '../components/SetupDock';
import { makeSeed } from '../game/hotseat';
import { cx } from '../lib/cx';
import { randomMapId, randomRaceId, shuffleIndices } from '../lib/randomPicks';
import { navigate } from '../lib/router';
import { useGameStore } from '../store/gameStore';
import landing from './LandingPage.module.css';
import styles from './SetupPage.module.css';

type SetupTab = 'players' | 'map' | 'race';

const TABS: SetupDockTab[] = [
  { id: 'players', label: '인원' },
  { id: 'map', label: '맵' },
  { id: 'race', label: '플레이어·종족' },
];

/**
 * 핫시트 설정 화면 (비게임 세계): 참가 인원 → 맵 → 플레이어별 닉네임·종족 → 게임 시작.
 * 2026-09-24 사용자 지시로 하단 독 탭([인원]·[맵]·[플레이어·종족])으로 재구성했다. "게임 시작"은
 * 어느 탭에 있든 항상 눌리도록 독 바로 위 고정 푸터에 둔다. 온라인 방은 RoomPage 의 로비가 맡는다.
 */
export function SetupPage({ onStart }: { onStart: () => void }) {
  const startHotseat = useGameStore((s) => s.startHotseat);
  const [tab, setTab] = useState<SetupTab>('players');
  const [playerCount, setPlayerCount] = useState(getMap(DEFAULT_MAP_ID).players);
  const [mapId, setMapId] = useState<MapId>(DEFAULT_MAP_ID);
  const [nicknames, setNicknames] = useState<string[]>(() => Array.from({ length: MAX_PLAYERS }, () => ''));
  const [races, setRaces] = useState<RaceId[]>(() => Array.from({ length: MAX_PLAYERS }, () => randomRaceId()));
  const [error, setError] = useState<string | null>(null);

  const map = getMap(mapId);
  const seats = useMemo(() => Array.from({ length: map.players }, (_, i) => i), [map.players]);

  const randomizeAll = (n: number) => {
    setMapId(randomMapId(mapsForPlayers(n)));
    setRaces(Array.from({ length: n }, () => randomRaceId()));
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

  const updateRace = (i: number, race: RaceId) => {
    setRaces((prev) => prev.map((r, j) => (j === i ? race : r)));
    setError(null);
  };

  const start = () => {
    try {
      // 선턴이 유리하므로(덤으로 일부 보정하지만) 입력 순서 그대로 좌석을 주지 않고 무작위로 섞는다
      // (2026-09-23 사용자 지시: 선턴도 랜덤으로). 좌석 색·턴 순서는 이 시점에 정해진다.
      const order = shuffleIndices(seats.length);
      startHotseat({
        mapId,
        seed: makeSeed(),
        players: order.map((i) => ({
          nickname: nicknames[i]?.trim() || `플레이어 ${i + 1}`,
          race: races[i] as RaceId,
        })),
      });
      onStart();
    } catch (e) {
      setError(e instanceof Error ? e.message : '게임을 시작하지 못했습니다');
    }
  };

  return (
    <DockShell
      id="setup"
      heroTitle="핫시트"
      heroSubtitle="한 브라우저에서 번갈아 둡니다. 턴이 바뀌면 기기를 넘기는 화면이 손패를 가립니다."
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id as SetupTab)}
      dockLabel="핫시트 설정 탭"
      footer={
        <>
          <button type="button" className="pill pill--outline" onClick={() => navigate('/')}>
            처음으로
          </button>
          <button type="button" className="pill pill--lg" onClick={start}>
            게임 시작
          </button>
          <span className={landing.help}>
            {map.name} · {map.players}명
          </span>
          {error && <p className={styles.error}>{error}</p>}
        </>
      }
    >
      {tab === 'players' && (
        <section className={landing.section}>
          <h2 className={landing.h2}>참가 인원</h2>
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
      )}

      {tab === 'map' && (
        <section className={landing.section}>
          <div className={styles.sectionHead}>
            <h2 className={landing.h2}>맵</h2>
            <button type="button" className="pill pill--outline" onClick={() => setMapId(randomMapId(mapsForPlayers(playerCount)))}>
              무작위
            </button>
          </div>
          <p className={landing.help}>{map.players}명이 들어가는 맵 중에서 고르세요.</p>
          <MapPicker value={mapId} onChange={setMapId} filterPlayers={playerCount} />
        </section>
      )}

      {tab === 'race' && (
        <section className={landing.section}>
          <h2 className={landing.h2}>플레이어 {map.players}명</h2>
          <p className={landing.help}>
            닉네임을 비워 두면 "플레이어 N"으로 들어갑니다. 턴 순서(좌석)는 여기 입력 순서와 무관하게 게임 시작 시
            무작위로 정해집니다(2026-09-23: 선턴이 유리해 순서를 미리 정하지 않습니다). 종족을 고르면 그 종족의
            고정 덱이 정해집니다 — "무작위"로 다시 뽑을 수도 있습니다.
          </p>
          <div className={styles.seatBlocks}>
            {seats.map((i) => {
              const race = RACES.find((r) => r.id === races[i]);
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
                    <summary className={styles.deckSummary}>종족: {race?.name ?? '고르는 중'}</summary>
                    <DeckPicker race={races[i] ?? null} onPickRace={(r) => updateRace(i, r)} onRandom={() => updateRace(i, randomRaceId())} />
                  </details>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </DockShell>
  );
}
