// 게임 테이블: 공통 대국 틀(GameShell) 안에 BGA 의 TTA 테이블처럼 쌓는다.
// ① 차례·할 일, 시대·라운드 ② 플레이어(누르면 그 사람 보드로) ③ 퀘스트 트랙 → 보드(나 먼저, 식민지 + 테크 웹) → 공용 영역 → 최근 기록(영역 안에서 스크롤)
// ④ 내 자원·남은 행동 ⑤ 퀘스트 고르기·습격·분쟁·차례 종료·되돌리기
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { GameShell, PlayerStrip, Sheet as MenuSheet, type PlayerChip } from '@gamehub/ui';
import { BUILDING_KINDS, CHARTER_FIELDS, UNIT_KINDS, type Action } from '../../engine/types';
import { CARD_DEFS } from '../../engine/data/cards';
import { buildingUnlocked, commandLeft, defenseValue, playerMods, unitUnlocked } from '../../engine/rules/derive';
import { BUILDING_COST, CHARTER_COST, COLONIST_FOOD, FEAST_MIN_FOOD, UNIT_COST } from '../../engine/data/constants';
import { SATELLITE_DEFS } from '../../engine/data/satellites';
import { researchBlock, researchCost, webGraph } from '../../engine/rules/research';
import { useApp } from '../store/app';
import type { AiSpeed } from '../store/storage';
import { useGame } from '../useGame';
import { useTurnWatch } from '../turnWatch';
import { scrollToId } from '../scroll';
import { ActionBar, EraDetail, Guide, MyArea, TurnCue, TurnStatus } from '../components/StatusBar';
import { QuestTrack } from '../components/QuestTrack';
import { ColonyBoard } from '../components/ColonyBoard';
import { TechWeb } from '../components/TechWeb';
import { CommonArea } from '../components/CommonArea';
import { PendingPrompt } from '../components/PendingPrompt';
import { ConfirmLayer, EraOverlay, LogDrawer, NoticeLayer, ScoreBoard } from '../components/Overlays';
import { Rules } from '../components/Rules';
import { useWakeLock } from '../useWakeLock';
import styles from './Table.module.css';

const AI_SPEEDS: [AiSpeed, string][] = [
  ['normal', '보통'],
  ['fast', '빠름'],
  ['instant', '즉시'],
];

export interface TableProps {
  /** 온라인 방 코드(한 기기 대전이면 null) */
  roomCode: string | null;
  /** 자리별 접속 여부(온라인만) */
  presence: boolean[] | null;
  onExit: () => void;
  /** 같은 설정으로 다시 하기(한 기기 대전만) */
  onRematch?: () => void;
}

export function Table(props: TableProps) {
  const game = useApp((s) => s.game);
  if (!game) return null;
  return <TableInner {...props} />;
}

function TableInner({ roomCode, presence, onExit, onRematch }: TableProps) {
  const { game, me, offline, watching } = useGame();
  const mode = useApp((s) => s.mode);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const [overlay, setOverlay] = useState<'menu' | 'log' | 'rules' | 'score' | null>(game.gameOver ? 'score' : null);
  // 온라인 방 나가기는 두 번 눌러야 한다(실수로 나가면 봇이 자리를 이어받음)
  const [leaveArmed, setLeaveArmed] = useState(false);
  useTurnWatch(game, me, !watching);
  // 한 판이 길고 상대 차례를 기다리는 시간이 많다 — 게임 중에는 화면이 꺼지지 않게(지원하는 브라우저만)
  useWakeLock(!game.gameOver);
  // 보드 순서: 나 → 나머지 플레이어를 자리 순서대로
  const order = [game.players[me], ...game.players.filter((p) => p.id !== me)];
  const actor = game.pending.length ? game.pending[0].player : game.current;
  const closeMenu = () => {
    setOverlay(null);
    setLeaveArmed(false);
  };
  const chips: PlayerChip[] = game.players.map((p) => ({
    id: p.id,
    name: `${p.id === game.startPlayer ? '① ' : ''}${p.name}`,
    color: `var(--seat-${p.id})`,
    score: p.res.culture,
    // 점수(문화)는 크게, 4인에서도 칩 폭에 들어가게 짧게
    detail: `방어${defenseValue(p)}·지휘${commandLeft(game, p)}`,
    active: !game.gameOver && p.id === actor,
    you: !watching && p.id === me,
    offline: presence ? presence[p.id] === false : false,
  }));
  const menuItem = (label: string, onClick: () => void, tone = '') => (
    <button className={`${styles.menuItem} ${tone}`} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <>
      <GameShell
        status={<TurnStatus />}
        detail={<EraDetail />}
        onMenu={() => setOverlay('menu')}
        players={<PlayerStrip players={chips} onSelect={(id) => scrollToId(`board-${id}`)} />}
        hand={watching ? undefined : <MyArea />}
        actions={<ActionBar onResults={() => setOverlay('score')} onQuest={() => scrollToId('quest-track')} />}
        notice={offline ? '연결 끊김 — 다시 연결하는 중(행동 잠김)' : null}
      >
        <div className={styles.scroll} data-testid="table">
          <QuestTrack />
          {/* 첫 판 코치·대외 단계 안내: 내 보드 바로 위 */}
          <Guide />
          {order.map((p) => (
            <div key={p.id} id={`board-${p.id}`} className={styles.board} style={{ '--seat': `var(--seat-${p.id})` } as CSSProperties}>
              <HitFlash harmed={p.harmedRound} round={game.round} />
              <h2 className={styles.banner}>
                {p.name}
                {p.id === me && !watching ? <span className={styles.tag}>내 보드</span> : <span className={styles.tag}>{p.id + 1}번 자리</span>}
              </h2>
              {p.id === me && !watching && <ActionChips />}
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
        </div>
      </GameShell>
      <PendingPrompt />
      <EraOverlay />
      <ConfirmLayer />
      <NoticeLayer />
      <TurnCue />
      {overlay === 'log' && <LogDrawer onClose={() => setOverlay(null)} />}
      {overlay === 'rules' && <Rules onClose={() => setOverlay(null)} />}
      {overlay === 'score' && <ScoreBoard onClose={() => setOverlay(null)} onHome={onExit} onRematch={onRematch} />}
      <MenuSheet open={overlay === 'menu'} title="메뉴" onClose={closeMenu}>
        {roomCode && <p className={styles.code}>방 코드: {roomCode}</p>}
        <div className={styles.menu}>
          {menuItem('게임 설명', () => setOverlay('rules'))}
          {menuItem('기록 보기', () => setOverlay('log'))}
          {menuItem('위성 시장으로', () => {
            closeMenu();
            scrollToId('common-area');
          })}
          {game.gameOver && menuItem('결과 보기', () => setOverlay('score'))}
        </div>
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
          <button role="switch" aria-checked={settings.turnSummary} className={styles.toggle} onClick={() => setSettings({ turnSummary: !settings.turnSummary })}>
            <span className={styles.check} aria-hidden>
              {settings.turnSummary ? '✓' : ''}
            </span>
            <span>내 차례가 오면 지난 차례 이후 요약 보기</span>
          </button>
          <button role="switch" aria-checked={settings.coach} className={styles.toggle} onClick={() => setSettings({ coach: !settings.coach })}>
            <span className={styles.check} aria-hidden>
              {settings.coach ? '✓' : ''}
            </span>
            <span>첫 판 안내(처음 3라운드) 보기</span>
          </button>
        </div>
        {leaveArmed && <p className={styles.warn}>한 번 더 누르면 방을 나갑니다. 이 자리는 봇이 이어받고 다시 들어올 수 없습니다.</p>}
        <div className={styles.menu}>
          {mode === 'online' && !watching && !game.gameOver
            ? leaveArmed
              ? menuItem('정말 나가기', onExit, styles.danger)
              : menuItem('방 나가기…', () => setLeaveArmed(true), styles.danger)
            : menuItem(mode === 'local' && !game.gameOver ? '처음 화면으로(자동 저장됨)' : '처음 화면으로', onExit, styles.danger)}
        </div>
      </MenuSheet>
    </>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, me, myTurn, offline]);
  if (!items.length) return null;
  return (
    <nav className={styles.chips} aria-label="지금 가능한 행동">
      <span className={styles.chipsLabel}>지금 가능</span>
      {items.map((it) => (
        <button key={it.label} className={styles.chip} onClick={() => scrollToId(it.target)}>
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
  const [last, setLast] = useState(harmed);
  const [n, setN] = useState(0);
  if (harmed !== last) {
    setLast(harmed);
    if (harmed === round) setN(n + 1);
  }
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => setN(0), 900);
    return () => clearTimeout(t);
  }, [n]);
  return n ? <div key={n} className="anim-flash" aria-hidden /> : null;
}
