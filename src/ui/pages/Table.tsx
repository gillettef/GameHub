// 게임 테이블: BGA 의 TTA 테이블처럼 상하 스크롤 한 화면 —
// 상단 고정 상태 줄(행동 버튼) → 플레이어 상태창 → 퀘스트 트랙(쓰루의 카드 줄 자리) → 플레이어별 보드(나 먼저) → 공용 영역
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BUILDING_KINDS, CHARTER_FIELDS, UNIT_KINDS, type Action } from '../../core/types';
import { CARD_DEFS } from '../../core/data/cards';
import { buildingUnlocked, commandLeft, playerMods, unitUnlocked } from '../../core/engine/derive';
import { BUILDING_COST, CHARTER_COST, COLONIST_FOOD, FEAST_MIN_FOOD, UNIT_COST } from '../../core/data/constants';
import { SATELLITE_DEFS } from '../../core/data/satellites';
import { researchBlock, researchCost, webGraph } from '../../core/engine/research';
import { useApp } from '../../store/app';
import type { AiSpeed } from '../../store/storage';
import { quitLocal, startLocal } from '../../store/localGame';
import { leaveOnline } from '../../online/client';
import { useGame } from '../useGame';
import { useTurnWatch } from '../turnWatch';
import { Guide, StatusBar } from '../components/StatusBar';
import { PlayerStrip } from '../components/PlayerStrip';
import { QuestTrack } from '../components/QuestTrack';
import { ColonyBoard } from '../components/ColonyBoard';
import { TechWeb } from '../components/TechWeb';
import { CommonArea } from '../components/CommonArea';
import { PendingPrompt } from '../components/PendingPrompt';
import { ConfirmLayer, EraOverlay, LogDrawer, NoticeLayer, ScoreBoard } from '../components/Overlays';
import { Rules } from '../components/Rules';
import { Sheet } from '../components/Sheet';
import { useWakeLock } from '../useWakeLock';
import styles from './Table.module.css';

const AI_SPEEDS: [AiSpeed, string][] = [
  ['normal', '보통'],
  ['fast', '빠름'],
  ['instant', '즉시'],
];

export function Table() {
  const game = useApp((s) => s.game);
  const session = useApp((s) => s.session);
  if (!game) return null;
  return <TableInner key={session} />;
}

function TableInner() {
  const { game, me } = useGame();
  const mode = useApp((s) => s.mode);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const [overlay, setOverlay] = useState<'menu' | 'log' | 'rules' | 'score' | null>(game.gameOver ? 'score' : null);
  // 온라인 방 나가기는 두 번 눌러야 한다(실수로 나가면 AI가 자리를 이어받음)
  const [leaveArmed, setLeaveArmed] = useState(false);
  const leave = () => (mode === 'online' ? leaveOnline() : quitLocal());
  useTurnWatch(game, me);
  // 다른 판(온라인 방 등)에서 남은 요약 대기열·배너는 비우고 시작
  useEffect(() => {
    useApp.getState().set({ notices: [], eraBanner: null });
  }, []);
  // 한 판이 길고 상대 차례를 기다리는 시간이 많다 — 게임 중에는 화면이 꺼지지 않게
  useWakeLock(!game.gameOver);
  // 보드 순서: 나 → 나머지 플레이어를 자리 순서대로
  const order = [game.players[me], ...game.players.filter((p) => p.id !== me)];
  const rematch =
    mode === 'local'
      ? () => {
          const host = game.players.find((p) => !p.isAI) ?? game.players[0];
          startLocal(host.name, game.players.length - 1, Math.floor(Math.random() * 2 ** 31));
        }
      : undefined;
  const closeMenu = () => {
    setOverlay(null);
    setLeaveArmed(false);
  };

  return (
    <div className={styles.table}>
      <StatusBar onMenu={() => setOverlay('menu')} onLog={() => setOverlay('log')} onResults={() => setOverlay('score')} />
      <main className={styles.main}>
        <PlayerStrip />
        <QuestTrack />
        {/* 첫 판 코치·대외 단계 안내: 상태 줄을 키우지 않게 스크롤 영역(내 보드 바로 위)에 */}
        <Guide />
        {order.map((p) => (
          <div key={p.id} id={`board-${p.id}`} className={`${styles.board}`} style={{ '--seat': `var(--seat-${p.id})` } as CSSProperties}>
            <HitFlash harmed={p.harmedRound} round={game.round} />
            <h2 className={styles.banner}>
              {p.name}
              {p.id === me ? <span className={styles.tag}>내 보드</span> : <span className={styles.tag}>{p.id + 1}번 자리</span>}
            </h2>
            {p.id === me && <ActionChips />}
            <div id={`colony-${p.id}`} className={styles.anchor}>
              <ColonyBoard player={p} />
            </div>
            <div id={`web-${p.id}`} className={styles.anchor}>
              <TechWeb player={p} />
            </div>
          </div>
        ))}
        <CommonArea />
        <RecentLog />
      </main>
      <PendingPrompt />
      <EraOverlay />
      <ConfirmLayer />
      <NoticeLayer />
      {overlay === 'log' && <LogDrawer onClose={() => setOverlay(null)} />}
      {overlay === 'rules' && <Rules onClose={() => setOverlay(null)} />}
      {overlay === 'score' && <ScoreBoard onClose={() => setOverlay(null)} onHome={leave} onRematch={rematch} />}
      {overlay === 'menu' && (
        <Sheet
          title="메뉴"
          onClose={closeMenu}
          actions={[
            { label: '게임 설명', onClick: () => setTimeout(() => setOverlay('rules')), tone: 'plain' },
            { label: '기록 보기', onClick: () => setTimeout(() => setOverlay('log')), tone: 'plain' },
            mode === 'online'
              ? leaveArmed
                ? { label: '정말 나가기 — 이 자리는 AI가 이어받습니다', onClick: leave, tone: 'danger' }
                : { label: '방 나가기…', onClick: () => setLeaveArmed(true), tone: 'danger', keepOpen: true }
              : { label: '처음 화면으로(자동 저장됨)', onClick: leave, tone: 'danger' },
          ]}
        >
          {mode === 'online' && <p>방 코드: {useApp.getState().lobby?.room}</p>}
          {leaveArmed && <p className={styles.warn}>한 번 더 누르면 방을 나갑니다. 다시 들어오려면 초대 코드로 새로 참가해야 합니다.</p>}
          <div className={styles.settings}>
            {mode === 'local' && (
              <div className={styles.setting}>
                <span>AI 속도</span>
                <div className={styles.seg} role="group" aria-label="AI 속도">
                  {AI_SPEEDS.map(([v, label]) => (
                    <button key={v} aria-pressed={settings.aiSpeed === v} className={settings.aiSpeed === v ? styles.on : ''} onClick={() => setSettings({ aiSpeed: v })}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className={styles.toggle}>
              <input type="checkbox" checked={settings.turnSummary} onChange={(e) => setSettings({ turnSummary: e.target.checked })} />
              <span>내 차례가 오면 지난 차례 이후 요약 보기</span>
            </label>
            <label className={styles.toggle}>
              <input type="checkbox" checked={settings.coach} onChange={(e) => setSettings({ coach: e.target.checked })} />
              <span>첫 판 안내(처음 3라운드) 보기</span>
            </label>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** 내 보드 위 "지금 가능한 행동" 칩 줄. 누르면 해당 구역으로 이동 */
function ActionChips() {
  const { game, me, myTurn, offline, check } = useGame();
  const items = useMemo(() => {
    if (offline || !myTurn || game.phase === 'quest') return [];
    const p = game.players[me];
    if (commandLeft(game, p) <= 0) return [];
    const mods = playerMods(p);
    const ok = (a: Action) => !check(a);
    const { nodes } = webGraph(game.layout);
    const research = Object.keys(nodes).filter((id) => nodes[id].kind !== 'core' && !p.researched.includes(id) && !researchBlock(game, p, id) && researchCost(game, p, id, mods) <= p.res.sci).length;
    // 엔진 검증(applyAction, 상태 복사)은 비싸다 — 해금·자원으로 먼저 거르고, 종류마다 첫 가능 단계에서 멈춘다
    const prod = p.res.prod;
    const build = BUILDING_KINDS.filter((k) => [0, 1, 2, 3].some((l) => buildingUnlocked(p, k, l) && BUILDING_COST[l] <= prod && ok({ type: 'build', kind: k, level: l }))).length;
    const units = UNIT_KINDS.filter((k) => [0, 1, 2, 3].some((l) => unitUnlocked(p, k, l) && (UNIT_COST[k][l] ?? Infinity) <= prod && ok({ type: 'buildUnit', kind: k, level: l }))).length;
    const supply = p.hand.filter((h, i) => !h.fresh && CARD_DEFS[h.id]?.type === 'supply' && ok({ type: 'useSupply', index: i })).length;
    const satellite = game.satMarket.filter((id, slot) => !!id && (SATELLITE_DEFS[id]?.cost ?? Infinity) <= p.res.energy && (ok({ type: 'launch', slot }) || (p.orbit.length > 0 && ok({ type: 'launch', slot, replace: 0 })))).length;
    const charter = CHARTER_FIELDS.filter((f) => p.charters[f] < 3 && CHARTER_COST[p.charters[f] + 1] <= p.res.culture && ok({ type: 'charter', field: f })).length;
    const colonist = p.pool > 0 && COLONIST_FOOD[game.era] <= p.res.food && ok({ type: 'addColonist' });
    const legacy = !!p.legacyWip && ok({ type: 'legacyStage' });
    const feast = !p.feasted && FEAST_MIN_FOOD <= p.res.food && ok({ type: 'feast' });
    const list: { label: string; target: string }[] = [];
    if (research) list.push({ label: `연구 ${research}`, target: `web-${me}` });
    if (build) list.push({ label: `건설 ${build}`, target: `colony-${me}` });
    if (units) list.push({ label: `편성 ${units}`, target: `colony-${me}` });
    if (colonist) list.push({ label: '정착민', target: `colony-${me}` });
    if (feast) list.push({ label: '만찬', target: `colony-${me}` });
    if (supply) list.push({ label: `팟 ${supply}`, target: `colony-${me}` });
    if (legacy) list.push({ label: '유산', target: `colony-${me}` });
    if (charter) list.push({ label: `헌장 ${charter}`, target: `colony-${me}` });
    if (satellite) list.push({ label: `위성 ${satellite}`, target: 'common-area' });
    return list;
    // check 는 game·me·myTurn·offline 으로 정해진다
  }, [game, me, myTurn, offline]);
  if (!items.length) return null;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  return (
    <nav className={styles.chips} aria-label="지금 가능한 행동">
      <span className={styles.chipsLabel}>지금 가능</span>
      {items.map((it) => (
        <button key={it.label} className={styles.chip} onClick={() => go(it.target)}>
          {it.label}
        </button>
      ))}
    </nav>
  );
}

/** 최근 기록 4줄(BGA 의 로그 패널 축약) */
function RecentLog() {
  const { game } = useGame();
  const last = game.log.slice(-4).reverse();
  return (
    <ul className={styles.recent} aria-label="최근 기록">
      {last.map((e, i) => (
        <li key={game.log.length - i} className="anim-slide-in" style={{ '--delay': `${(last.length - 1 - i) * 60}ms` } as CSSProperties}>
          {e.player !== null && <strong>{game.players[e.player].name} </strong>}
          {e.text}
        </li>
      ))}
    </ul>
  );
}

/** 이 보드가 습격·분쟁·위협으로 피해를 입은 순간 붉게 번쩍인다(harmedRound 가 이번 라운드로 바뀔 때) */
function HitFlash({ harmed, round }: { harmed: number; round: number }) {
  const last = useRef(harmed);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (harmed !== last.current) {
      last.current = harmed;
      if (harmed === round) setN((x) => x + 1);
    }
  }, [harmed, round]);
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => setN(0), 900);
    return () => clearTimeout(t);
  }, [n]);
  return n ? <div key={n} className="anim-flash" aria-hidden /> : null;
}
