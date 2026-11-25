/**
 * 대국 화면. 공통 GameShell 배치(docs/refactor-plan.md 5절):
 * ① 할 일·라운드·단계 ② 공원 줄(만족도·돈, 누르면 그 공원 보기) ③ 진행 단계·운영카드·최근 소식·공원 보드
 * ④ 단계별 내 영역(시설 시장 / 관객 줄·입찰 / 입장료 / 배치할 그룹 / 관리) ⑤ 단계별 확정 버튼. ≡ 메뉴: 기록·규칙·나가기
 */
import { GameShell, PlayerStrip } from '@gamehub/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { View } from '../def';
import { CARD_BY_ID } from '../engine/data/cards';
import { GROUP_BY_ID, sizeOf } from '../engine/data/groups';
import {
  CFG,
  bidOrder,
  cardAt,
  computeReport,
  enters,
  feeCap,
  fitOf,
  freeCleansOf,
  freeRepairsOf,
  groupQuota,
  hireCost,
  isHumanTurn,
  overflowOf,
  placeSat,
  priceOf,
  rankings,
  usableRide,
  wearsOut,
  winners,
  type Action,
} from '../engine/engine';
import { STAFF_KEYS, type GameState, type ParkCard, type Player } from '../engine/types';
import { Icon, type IconName } from './Icon';
import { PHASES, STAFF_META, TYPE_META } from './meta';
import { FacilityArt, FacilityStats, GroupCard, GroupChip, Members, Money, Num, Pips, Sheet, TargetIcon, TypeChip, Vp } from './parts';
import { haptic } from './platform/haptics';
import { ReportSheet } from './Report';
import { RulesBody } from './Rules';
import { Slot } from './Slot';
import { showTip } from './tip';

export interface GameScreenProps {
  view: View;
  /** 지금 둘 좌석들 */
  actors: number[];
  act(a: Action): void;
  /** 여러 행동을 차례로(전부 청소). 온라인은 한 번에 하나씩 보낸다 */
  acts(list: Action[]): void;
  error: string | null;
  /** 같은 오류가 다시 나도 알림을 띄우도록 바뀌는 값 */
  errorTick: unknown;
  /** 한 기기 돌려 하기(사람 여럿): 할 일에 이름을 붙인다 */
  hotseat?: boolean;
  /** 온라인: 좌석별 접속 여부 */
  presence?: boolean[] | null;
  onExit(): void;
  exitLabel?: string;
  onRematch?(): void;
  /** 한 기기 봇 진행 일시정지(봇끼리 판) */
  paused?: boolean;
  onPause?(paused: boolean): void;
}

type SheetState =
  | { kind: 'detail'; slot: number }
  | { kind: 'card'; cardId: number }
  | { kind: 'replace'; cardId: number; slot: number }
  | { kind: 'rules' }
  | { kind: 'log' }
  | { kind: 'menu' }
  | { kind: 'report' }
  | null;

const short = (name: string) => name.replace(/ 파크$/, '');
const seatColor = (id: number) => `hsl(${id * 70} 70% 60%)`;

export function GameScreen(props: GameScreenProps) {
  const { view: v, actors, act, error, errorTick } = props;
  const game = v.game;
  const meId = v.me;
  const me = meId !== null ? game.players[meId] : null;
  const canAct = meId !== null && actors.includes(meId);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [picked, setSelected] = useState<number | null>(null);
  const [selGroup, setSelGroup] = useState<number | null>(null);
  const [viewId, setViewId] = useState(meId ?? 0);
  const [overOpen, setOverOpen] = useState(true);
  // 단계/라운드/보는 사람이 바뀌면 선택 초기화, 내 공원으로 복귀 (렌더 중에 맞춘다)
  const stage = `${game.phase}:${game.round}:${game.step}:${meId}`;
  const [seenStage, setSeenStage] = useState(stage);
  if (seenStage !== stage) {
    setSeenStage(stage);
    setSelected(null);
    setSelGroup(null);
    setViewId(meId ?? 0);
  }
  // 오류 알림: 새 오류(errorTick)마다 1.8초
  const [dismissed, setDismissed] = useState<unknown>(null);
  const toast = error && dismissed !== errorTick ? error : null;
  useEffect(() => {
    if (!error) return;
    haptic(30);
    const t = setTimeout(() => setDismissed(errorTick), 1800);
    return () => clearTimeout(t);
  }, [error, errorTick]);
  // 선택한 카드가 팔리거나 사라지면 해제
  const selected = picked !== null && game.market.includes(picked) ? picked : null;

  const view = game.players[viewId] ?? me ?? game.players[0];
  const mine = me !== null && view.id === me.id;
  const placing = game.phase === 'operate' && game.step !== 'result' && meId !== null && game.opStep[meId] === 'place';

  const myTurn = meId !== null && isHumanTurn(game, meId) && canAct;
  const selCard = selected !== null ? CARD_BY_ID[selected] : null;
  const selG = me && selGroup !== null ? GROUP_BY_ID[me.groups[selGroup]] : null;
  const repairCount = view.facilities.filter((f) => f?.repair).length;
  // 진행 기록은 뒤에만 덧붙으므로 원래 인덱스를 안정 키로 쓴다
  const recent = game.log
    .map((text, idx) => ({ text, idx }))
    .filter((l) => !/^\d+라운드 ·/.test(l.text))
    .slice(-3);
  // 남의 입장료·배치는 운영 결과가 나오기 전에는 가려져 있다
  const hiddenOp = !mine && game.phase === 'operate' && game.step !== 'result';
  // 배치 단계: 칸 → 배치된 그룹 index
  const placedAt = new Map<number, number>();
  if (game.phase === 'operate' && !hiddenOp) view.place.forEach((slot, gi) => slot !== null && slot !== undefined && placedAt.set(slot, gi));

  const tapSlot = (i: number) => {
    const f = view.facilities[i];
    if (mine && me && selCard && myTurn) {
      if (!f) {
        haptic();
        act({ type: 'buy', cardId: selCard.id, slot: i });
        setSelected(null);
      } else {
        setSheet({ kind: 'replace', cardId: selCard.id, slot: i });
      }
      return;
    }
    if (mine && me && placing) {
      if (selGroup !== null) {
        if (!usableRide(me, i)) {
          showTip(f?.repair ? '수리 토큰이 있어 이번 라운드에는 운영할 수 없어요' : '관객 그룹은 놀이기구에만 배치할 수 있어요');
          return;
        }
        haptic(10);
        act({ type: 'place', index: selGroup, slot: i });
        setSelGroup(null);
        return;
      }
      const gi = placedAt.get(i);
      if (gi !== undefined) {
        haptic(8);
        act({ type: 'place', index: gi, slot: null });
        return;
      }
    }
    if (f) setSheet({ kind: 'detail', slot: i });
  };

  const buy = (cardId: number, slot: number) => {
    haptic();
    act({ type: 'buy', cardId, slot });
    setSelected(null);
    setSheet(null);
  };

  const dock: DockParts = me
    ? dockFor({
        ...props,
        game,
        me,
        canAct,
        myTurn,
        selected,
        setSelected,
        selGroup,
        setSelGroup,
        viewMine: mine,
        goMine: () => setViewId(me.id),
        showCard: (cardId) => setSheet({ kind: 'card', cardId }),
        openReport: () => setSheet({ kind: 'report' }),
        openResult: () => setOverOpen(true),
      })
    : spectatorDock(game, () => setOverOpen(true), props.onExit);

  const showReport = (game.phase === 'operate' && game.step === 'result' && canAct) || sheet?.kind === 'report';
  const presence = props.presence;

  return (
    <>
      <GameShell
        status={statusText(game, v, actors, props.hotseat ?? false)}
        detail={`${Math.min(game.round, game.maxRounds)}/${game.maxRounds} 라운드 · ${PHASES.find((p) => p.key === game.phase)?.label ?? '끝'}${game.event && game.phase !== 'gameOver' ? ` · ${game.event.name}` : ''}`}
        onMenu={() => setSheet({ kind: 'menu' })}
        players={
          <PlayerStrip
            players={game.players.map((p) => ({
              id: p.id,
              name: `${short(p.name)}${game.first === p.id && game.phase !== 'gameOver' ? ' · 선' : ''}`,
              color: seatColor(p.id),
              score: <Vp value={p.vp} />,
              detail: <Money value={p.money} />,
              active: actors.includes(p.id) || (game.phase === 'construct' && game.turn === p.id) || (game.phase === 'promote' && game.step === 'pick' && game.pickTurn === p.id),
              you: p.id === meId,
              offline: presence ? presence[p.id] === false && !p.isAI : false,
            }))}
            onSelect={(id) => {
              haptic(8);
              setViewId(id);
              setSelected(null);
            }}
          />
        }
        hand={dock.hand}
        actions={dock.actions}
      >
        <div className="sp-main">
          <nav className="steps" aria-label="진행 단계">
            {PHASES.map((p, i) => {
              const idx = PHASES.findIndex((x) => x.key === game.phase);
              const state = game.phase === 'gameOver' ? 'done' : i < idx ? 'done' : i === idx ? 'now' : '';
              return (
                <div key={p.key} className={`step ${state}`}>
                  <span className="step-ico">
                    <Icon name={state === 'done' ? 'check' : p.icon} size={16} stroke={2.2} />
                  </span>
                  {p.label}
                </div>
              );
            })}
          </nav>

          {game.event && (
            <div className="event">
              <Slot slot={`event/${game.event.id}`} tint="#6a4cff" className="event-art" fallback={<Icon name={game.event.icon as IconName} size={24} />} />
              <div className="event-txt">
                <small>이번 라운드 운영카드</small>
                <b>{game.event.name}</b>
                <span>{game.event.desc}</span>
                {game.nextEvent && (
                  <button type="button" className="event-next" onClick={() => showTip(`다음 라운드: ${game.nextEvent!.name} · ${game.nextEvent!.desc}`)}>
                    <Icon name={game.nextEvent.icon as IconName} size={13} /> 다음: {game.nextEvent.name}
                  </button>
                )}
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <ul className="ticker" aria-label="최근 소식">
              {recent.map((l) => (
                <li key={l.idx}>{l.text}</li>
              ))}
            </ul>
          )}

          <section className={`board ${mine ? '' : 'rival'}`} aria-label={`${view.name} 공원`}>
            <div className="board-head">
              <div className="board-title">
                <Slot slot="visitor/adult" tint={mine ? '#ffd54a' : seatColor(view.id)} className="avatar" fallback={<Icon name="smile" size={22} />} />
                <div>
                  <b>{view.name}</b>
                  <small>
                    {mine ? '내 공원' : me ? '상대 공원 (보기 전용)' : '공원 (관전)'} · 시설 {view.facilities.filter(Boolean).length}/{CFG.slots}
                  </small>
                </div>
              </div>
              <div className="board-res">
                <Money value={view.money} big />
                <Vp value={view.vp} big />
              </div>
            </div>

            <div className="slots">
              {view.facilities.map((f, i) => {
                const c = f ? CARD_BY_ID[f.id] : null;
                const target = mine && !!selCard && myTurn;
                const gi = placedAt.get(i);
                const g = gi !== undefined ? GROUP_BY_ID[view.groups[gi]] : null;
                // 배치할 그룹을 고른 상태면 들어갈 수 있는지 표시
                const fit = mine && me && placing && selG && c && usableRide(me, i) ? fitOf(c, selG) : undefined;
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={c ? `${i + 1}번 부지 ${c.name}${f?.repair ? ' (수리 토큰)' : ''}` : `${i + 1}번 빈 부지`}
                    className={`tile ${c ? '' : 'empty'} ${target ? 'target' : ''} ${f?.repair ? 'broken' : ''} ${fit ? 'fit' : ''} ${fit === null ? 'nofit' : ''}`}
                    onClick={() => tapSlot(i)}
                  >
                    {c ? (
                      <>
                        <FacilityArt card={c} />
                        <div className="tile-name">{c.name}</div>
                        <TileStat c={c} />
                        <span className="tile-type" style={{ ['--c' as string]: TYPE_META[c.type].color }}>
                          <Icon name={TYPE_META[c.type].icon} size={12} stroke={2} />
                        </span>
                        {g && (
                          <span className="tile-group">
                            <Members g={g} size={11} />
                            <b>+{placeSat(game, view, c, g)}</b>
                          </span>
                        )}
                        {fit && selG && me && (
                          <span className="tile-fit">
                            +{placeSat(game, me, c, selG)}
                            {fit === 'over' ? ' 초과' : ''}
                            {wearsOut(c, selG) ? ' · 수리' : ''}
                          </span>
                        )}
                        {f?.repair && (
                          <div className="tile-broken">
                            <Icon name="wrench" size={24} />
                            <b>수리 토큰</b>
                          </div>
                        )}
                      </>
                    ) : (
                      <Slot slot="ui/slot-empty" tint="#3a3380" className="tile-empty" fallback={<Icon name="plus" size={26} />}>
                        <span className="tile-empty-label">{target ? '여기에 건설' : '빈 부지'}</span>
                      </Slot>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="board-foot">
              <div className="staff-row">
                {STAFF_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="staff-chip"
                    style={{ ['--c' as string]: STAFF_META[k].color }}
                    onClick={() => showTip(`${STAFF_META[k].label} Lv.${view.staff[k]} · ${STAFF_META[k].desc}`)}
                    aria-label={`${STAFF_META[k].label} 레벨 ${view.staff[k]}: ${STAFF_META[k].desc}`}
                  >
                    <Icon name={STAFF_META[k].icon} size={18} />
                    <Pips level={view.staff[k]} color={STAFF_META[k].color} />
                  </button>
                ))}
              </div>
              <div className="tokens">
                <button
                  type="button"
                  className={`token ${view.trash > 0 ? 'warn' : ''}`}
                  aria-label={`쓰레기 토큰 ${view.trash}개`}
                  onClick={() => showTip(`쓰레기 토큰 ${view.trash}개 · 상점이 남긴 쓰레기예요. 라운드가 끝날 때 남은 쓰레기 1개마다 만족도 -1.`)}
                >
                  <Icon name="trash" size={15} />
                  <span className="token-label">쓰레기</span>
                  <Num value={view.trash} />
                </button>
                <button
                  type="button"
                  className={`token ${repairCount > 0 ? 'bad' : ''}`}
                  aria-label={`수리 토큰 ${repairCount}개`}
                  onClick={() => showTip(`수리 토큰 ${repairCount}개 · 정원을 꽉 채운 놀이기구에 놓여요. 수리할 때까지 운영하지 못해요.`)}
                >
                  <Icon name="wrench" size={15} />
                  <span className="token-label">수리</span>
                  <Num value={repairCount} />
                </button>
              </div>
            </div>

            {view.groups.length > 0 && !(mine && game.phase === 'operate' && game.step !== 'result') && (
              <div className="entrance">
                <span className="entrance-label">
                  <Icon name="ticket" size={14} /> 입구
                  {(game.phase === 'operate' || game.phase === 'manage') && !hiddenOp ? ` · 입장료 $${view.fee}` : ''}
                  {hiddenOp ? ' · 입장료·배치는 운영 결과 때 공개' : ''}
                </span>
                <div className="entrance-row">
                  {view.groups.map((id) => (
                    <GroupChip key={id} g={GROUP_BY_ID[id]} enters={game.phase === 'promote' || hiddenOp ? undefined : enters(GROUP_BY_ID[id], view.fee)} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </GameShell>

      {showReport && (
        <ReportSheet
          game={game}
          me={meId}
          onNext={canAct && game.phase === 'operate' && game.step === 'result' ? () => act({ type: 'continue' }) : undefined}
          onClose={sheet?.kind === 'report' ? () => setSheet(null) : undefined}
        />
      )}
      {game.phase === 'gameOver' && overOpen && <GameOver game={game} meId={meId} onExit={props.onExit} onRematch={props.onRematch} onClose={() => setOverOpen(false)} />}

      {sheet?.kind === 'detail' && view.facilities[sheet.slot] && (
        <DetailSheet
          card={CARD_BY_ID[view.facilities[sheet.slot]!.id]}
          repair={view.facilities[sheet.slot]!.repair}
          canRepair={mine && canAct && game.phase === 'manage' && !!me && me.money >= CFG.repairCost}
          phaseManage={mine && canAct && game.phase === 'manage'}
          onRepair={() => act({ type: 'repair', slot: sheet.slot })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'card' && CARD_BY_ID[sheet.cardId] && (
        <DetailSheet card={CARD_BY_ID[sheet.cardId]} price={me ? priceOf(me, CARD_BY_ID[sheet.cardId]) : CARD_BY_ID[sheet.cardId].cost} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'replace' && me && me.facilities[sheet.slot] && (
        <Sheet title="철거하고 새로 지을까요?" onClose={() => setSheet(null)}>
          <div className="replace">
            <MiniCard card={CARD_BY_ID[me.facilities[sheet.slot]!.id]} label="철거" />
            <Icon name="arrow" size={22} />
            <MiniCard card={CARD_BY_ID[sheet.cardId]} label="건설" />
          </div>
          <p className="muted center">기존 시설은 환불 없이 사라져요.</p>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setSheet(null)}>
              취소
            </button>
            <button type="button" className="btn primary" onClick={() => buy(sheet.cardId, sheet.slot)}>
              <Icon name="build" size={18} /> 건설 (${priceOf(me, CARD_BY_ID[sheet.cardId])})
            </button>
          </div>
        </Sheet>
      )}
      {sheet?.kind === 'rules' && (
        <Sheet title="게임 규칙" onClose={() => setSheet(null)} tall>
          <RulesBody />
        </Sheet>
      )}
      {sheet?.kind === 'log' && (
        <Sheet title="진행 기록" onClose={() => setSheet(null)} tall>
          <ul className="log">
            {game.log
              .map((l, idx) => ({ l, idx }))
              .reverse()
              .map(({ l, idx }) => (
                <li key={idx} className={/^\d+라운드 ·/.test(l) ? 'head' : ''}>
                  {l}
                </li>
              ))}
          </ul>
        </Sheet>
      )}
      {sheet?.kind === 'menu' && (
        <Sheet title="메뉴" onClose={() => setSheet(null)}>
          <div className="menu">
            <button type="button" className="btn ghost" onClick={() => setSheet({ kind: 'log' })}>
              <Icon name="log" size={18} /> 진행 기록
            </button>
            <button type="button" className="btn ghost" onClick={() => setSheet({ kind: 'rules' })}>
              <Icon name="help" size={18} /> 규칙 보기
            </button>
            {game.players.some((p) => p.report) && game.phase !== 'construct' && game.phase !== 'promote' && (
              <button type="button" className="btn ghost" onClick={() => setSheet({ kind: 'report' })}>
                <Icon name="star" size={18} /> 이번 라운드 운영 결과
              </button>
            )}
            {props.onPause && (
              <button type="button" className="btn ghost" onClick={() => props.onPause!(!props.paused)}>
                <Icon name="operate" size={18} /> {props.paused ? '봇 진행 다시 시작' : '봇 진행 일시정지'}
              </button>
            )}
            <button type="button" className="btn danger" onClick={props.onExit}>
              <Icon name="close" size={18} /> {props.exitLabel ?? '처음으로 (자동 저장됨)'}
            </button>
          </div>
        </Sheet>
      )}

      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}
    </>
  );
}

/** ① 할 일 */
function statusText(game: GameState, v: View, actors: number[], hotseat: boolean): string {
  const meId = v.me;
  const name = (id: number) => short(game.players[id]?.name ?? `${id + 1}번`);
  if (game.phase === 'gameOver') {
    const w = winners(game);
    return `게임 종료 · ${w.map((p) => short(p.name)).join(' · ')} ${w.length > 1 ? '공동 ' : ''}승리`;
  }
  if (meId === null) {
    const turn = game.phase === 'construct' ? game.turn : game.phase === 'promote' && game.step === 'pick' ? game.pickTurn : null;
    return `관전 중${turn !== null ? ` · ${name(turn)} 차례` : ''}`;
  }
  const mine = actors.includes(meId);
  const who = hotseat ? `${name(meId)} 차례` : '내 차례';
  switch (game.phase) {
    case 'construct':
      return mine ? `${who} · 시설 건설` : `${name(game.turn)} 건설 중`;
    case 'promote':
      if (game.step === 'bid') return mine ? `${who} · 홍보 입찰` : v.bidDone[meId] ? '입찰 완료 · 다른 공원을 기다리는 중' : '홍보 입찰 중';
      return mine ? `${who} · 관객 모집` : game.pickDone[meId] ? `모집 완료 · ${name(game.pickTurn)} 고르는 중` : `${name(game.pickTurn)} 관객 고르는 중`;
    case 'operate':
      if (game.step === 'result') return mine ? `${who} · 운영 결과 확인` : '결과 확인 완료 · 다른 공원을 기다리는 중';
      if (!mine) return '운영 준비 완료 · 다른 공원을 기다리는 중';
      return game.opStep[meId] === 'fee' ? `${who} · 입장료 정하기` : `${who} · 그룹 배치`;
    case 'manage':
      return mine ? `${who} · 관리` : '관리 완료 · 다른 공원을 기다리는 중';
  }
}

/** 부지 타일의 인쇄값 요약 */
function TileStat({ c }: { c: ParkCard }) {
  if (c.kind === 'ride') {
    return (
      <div className="tile-stat">
        <span>
          <Icon name="family" size={11} />
          {c.cap}
        </span>
        <span>
          <TargetIcon target={c.target} size={10} />
          <Icon name="star" size={11} />
          {c.sat}
        </span>
      </div>
    );
  }
  if (c.kind === 'shop') {
    return (
      <div className="tile-stat">
        <span>
          <Icon name="coin" size={11} />
          {c.income}/그룹
        </span>
      </div>
    );
  }
  return (
    <div className="tile-stat">
      <span>
        <Icon name="sparkle" size={11} />
        부대시설
      </span>
    </div>
  );
}

function MiniCard({ card, label }: { card: ParkCard; label: string }) {
  return (
    <div className="mini">
      <FacilityArt card={card} />
      <b>{card.name}</b>
      <small>{label}</small>
    </div>
  );
}

const KIND_LABEL = { ride: '놀이기구 · 만족도', shop: '상점 · 돈', amenity: '부대시설 · 매 라운드 효과' } as const;

interface DetailProps {
  card: ParkCard;
  onClose: () => void;
  /** 시장 카드 정보로 열 때 건설비 */
  price?: number;
  repair?: boolean;
  canRepair?: boolean;
  phaseManage?: boolean;
  onRepair?: () => void;
}

function DetailSheet({ card, onClose, price, repair, canRepair, phaseManage, onRepair }: DetailProps) {
  return (
    <Sheet onClose={onClose} label={`${card.name} 정보`}>
      <FacilityArt card={card} className="art-lg" />
      <div className="detail-head">
        <h2>{card.name}</h2>
        <TypeChip type={card.type} />
      </div>
      <p className="muted small">{KIND_LABEL[card.kind]}</p>
      {price !== undefined && (
        <p className="detail-price">
          건설비 <b>${price}</b>
        </p>
      )}
      <FacilityStats card={card} labeled />
      {card.fx.text && (
        <p className="effect">
          <Icon name="sparkle" size={14} /> {card.fx.text}
        </p>
      )}
      {card.kind === 'ride' && <p className="muted small">그룹의 취향이 이 유형이면 +{CFG.favBonus}. 그룹 인원이 정원과 같으면(꽉 차면) 수리 토큰을 받아요.</p>}
      {card.orig && <p className="muted small">원본 카드 문구: {card.orig}</p>}
      {repair && (
        <div className="callout bad">
          <Icon name="wrench" size={20} />
          <div>
            <b>수리 토큰</b>
            <span>수리할 때까지 운영하지 못해요. (유지비는 계속 나가요)</span>
          </div>
          {phaseManage && onRepair && (
            <button
              type="button"
              className="btn small primary"
              disabled={!canRepair}
              onClick={() => {
                onRepair();
                onClose();
              }}
            >
              수리 ${CFG.repairCost}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ───────── ④ 내 영역 · ⑤ 행동 버튼 ───────── */

interface DockParts {
  hand?: ReactNode;
  actions?: ReactNode;
}

interface DockProps extends GameScreenProps {
  game: GameState;
  me: Player;
  canAct: boolean;
  myTurn: boolean;
  selected: number | null;
  setSelected: (id: number | null) => void;
  selGroup: number | null;
  setSelGroup: (i: number | null) => void;
  viewMine: boolean;
  goMine: () => void;
  showCard: (cardId: number) => void;
  openReport: () => void;
  openResult: () => void;
}

function Waiting({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="sp-dock">
      <div className="dock-title">
        <Icon name={icon} size={18} /> {title}
      </div>
      <p className="hint">{text}</p>
    </div>
  );
}

function OverActions({ onExit, openResult }: { onExit: () => void; openResult: () => void }) {
  return (
    <>
      <button type="button" className="btn ghost" onClick={onExit}>
        처음으로
      </button>
      <button type="button" className="btn primary" onClick={openResult}>
        <Icon name="trophy" size={18} /> 결과 보기
      </button>
    </>
  );
}

function dockFor(p: DockProps): DockParts {
  const { game, me, canAct } = p;
  if (game.phase === 'construct') return constructDock(p);
  if (game.phase === 'promote') return game.step === 'bid' ? bidDock(p) : pickDock(p);
  if (game.phase === 'operate') {
    if (game.step === 'result') {
      return {
        hand: <Waiting icon="operate" title="운영 결과" text={canAct ? '이번 라운드 결과를 확인하세요.' : '다른 공원이 결과를 확인하는 중이에요.'} />,
        actions: (
          <button type="button" className="btn ghost" onClick={p.openReport}>
            <Icon name="star" size={18} /> 결과 보기
          </button>
        ),
      };
    }
    const st = game.opStep[me.id];
    if (canAct && st === 'fee') return feeDock(p);
    if (canAct && st === 'place') return placeDock(p);
    return { hand: <Waiting icon="operate" title="운영 준비 완료" text="모든 공원이 문을 열면 함께 운영 결과가 나와요." /> };
  }
  if (game.phase === 'manage') {
    if (!canAct) return { hand: <Waiting icon="manage" title="관리 완료" text="다른 공원이 관리를 마치면 다음 라운드가 시작돼요." /> };
    return manageDock(p);
  }
  return {
    hand: <Waiting icon="trophy" title="게임이 끝났어요" text={`${game.maxRounds}라운드가 끝났어요. 남은 돈 $${CFG.moneyPerVp}마다 만족도 +1이 더해졌어요.`} />,
    actions: <OverActions onExit={p.onExit} openResult={p.openResult} />,
  };
}

function spectatorDock(game: GameState, openResult: () => void, onExit: () => void): DockParts {
  if (game.phase !== 'gameOver') {
    return { hand: <Waiting icon="smile" title="관전 중" text="공원 이름을 누르면 그 공원을 볼 수 있어요. 비밀 입찰액과 운영 전 입장료·배치는 공개될 때까지 가려져요." /> };
  }
  return { actions: <OverActions onExit={onExit} openResult={openResult} /> };
}

function constructDock({ game, me, act, selected, setSelected, myTurn, viewMine, goMine, showCard }: DockProps): DockParts {
  return {
    hand: (
      <div className="sp-dock">
        <div className="dock-title">
          <Icon name="build" size={18} /> 건설 · 시설 시장
          <span className="quota">
            이번 라운드 {me.built}/{CFG.buildsPerRound}
          </span>
        </div>
        <div className="hint">
          {selected !== null ? (
            <>
              건설할 <b>부지를 탭</b>하세요
              <span className="hint-links">
                <button type="button" className="link" onClick={() => showCard(selected)}>
                  카드 정보
                </button>
                <button type="button" className="link" onClick={() => setSelected(null)}>
                  선택 취소
                </button>
              </span>
            </>
          ) : !viewMine ? (
            <>
              상대 공원을 보는 중이에요{' '}
              <button type="button" className="link" onClick={goMine}>
                내 공원으로
              </button>
            </>
          ) : myTurn ? (
            <>카드를 탭해 고른 뒤 부지에 건설해요 · 차례마다 1장, 라운드당 {CFG.buildsPerRound}장까지</>
          ) : (
            <>다른 공원이 건설하는 중이에요</>
          )}
        </div>
        <div className="market">
          {game.market.length === 0 && <div className="muted pad">시장이 비었어요</div>}
          {game.market.map((id) => (
            <MarketCard
              key={id}
              card={CARD_BY_ID[id]}
              me={me}
              selected={selected === id}
              onTap={() => {
                haptic(8);
                setSelected(selected === id ? null : id);
              }}
            />
          ))}
        </div>
      </div>
    ),
    actions: (
      <button type="button" className="btn primary" onClick={() => act({ type: 'pass' })} disabled={!myTurn}>
        건설 마치기 <Icon name="arrow" size={18} />
      </button>
    ),
  };
}

/** 입찰액은 ④(정하기)와 ⑤(공개 버튼)가 함께 쓰므로 좌석·라운드마다 모듈 안에 둔다 */
const bidDraft = new Map<string, number>();
const draftListeners = new Set<() => void>();
function useBidDraft(game: GameState, me: Player): [number, (v: number) => void] {
  const key = `${game.round}:${me.id}`;
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    draftListeners.add(l);
    return () => {
      draftListeners.delete(l);
    };
  }, []);
  const set = (v: number) => {
    bidDraft.set(key, Math.max(0, Math.min(me.money, v)));
    for (const l of draftListeners) l();
  };
  return [Math.min(bidDraft.get(key) ?? 0, me.money), set];
}

/** 홍보 ① 비공개 입찰: 관객 줄을 보고 홍보비를 정한다 */
function bidDock(p: DockProps): DockParts {
  if (!p.canAct) {
    return {
      hand: (
        <div className="sp-dock">
          <div className="dock-title">
            <Icon name="promote" size={18} /> 홍보 · 입찰 완료
          </div>
          <p className="hint">다른 공원이 입찰하면 동시에 공개돼요. 낸 금액: ${p.me.bid ?? 0}</p>
          <div className="vrow">
            {p.game.groupRow.map(({ g }) => (
              <GroupCard key={g} g={GROUP_BY_ID[g]} />
            ))}
          </div>
        </div>
      ),
    };
  }
  return { hand: <BidHand {...p} />, actions: <BidAction {...p} /> };
}

function BidHand({ game, me }: DockProps) {
  const [amount, setAmount] = useBidDraft(game, me);
  const set = (v: number) => {
    haptic(8);
    setAmount(v);
  };
  const n = game.players.length;
  const dist = (id: number) => (id - game.first + n) % n;
  const tieRank = [...game.players].sort((a, b) => dist(b.id) - dist(a.id)).findIndex((x) => x.id === me.id) + 1;
  return (
    <div className="sp-dock">
      <div className="dock-title">
        <Icon name="promote" size={18} /> 홍보 · 비공개 입찰
        <span className="quota">모집 {groupQuota(game, me)}그룹</span>
      </div>
      <div className="hint">
        관객 줄을 보고 <b>홍보비</b>를 정하세요. 모두 동시에 공개하고, <b>많이 낸 순서</b>로 그룹을 1개씩 번갈아 데려와요. 낸 돈은 돌아오지 않아요. 동점이면 선 플레이어에서 먼 공원이 먼저예요(나는 {tieRank}번째).
      </div>
      <div className="vrow">
        {game.groupRow.map(({ g }) => (
          <GroupCard key={g} g={GROUP_BY_ID[g]} />
        ))}
      </div>
      <div className="bid">
        <button type="button" className="btn round" onClick={() => set(amount - 1)} disabled={amount <= 0} aria-label="1 줄이기">
          −
        </button>
        <div className="bid-val">
          <Icon name="coin" size={22} />
          <b>{amount}</b>
        </div>
        <button type="button" className="btn round" onClick={() => set(amount + 1)} disabled={amount >= me.money} aria-label="1 늘리기">
          +
        </button>
      </div>
      <div className="fees quick">
        {[0, 1, 2, 3, 5, 8]
          .filter((x) => x <= me.money)
          .map((x) => (
            <button type="button" key={x} className={`fee ${amount === x ? 'on' : ''}`} onClick={() => set(x)}>
              <b>${x}</b>
            </button>
          ))}
      </div>
    </div>
  );
}

function BidAction({ game, me, act }: DockProps) {
  const [amount] = useBidDraft(game, me);
  return (
    <button
      type="button"
      className="btn primary"
      onClick={() => {
        haptic(20);
        act({ type: 'bid', amount });
      }}
    >
      입찰 공개 (${amount}) <Icon name="arrow" size={18} />
    </button>
  );
}

/** 홍보 ② 관객 고르기: 입찰 순서대로 그룹 카드를 1장씩 */
function pickDock({ game, me, act, canAct }: DockProps): DockParts {
  const quota = groupQuota(game, me);
  const mineTurn = canAct && game.pickTurn === me.id && !game.pickDone[me.id];
  const order = game.pickOrder.length ? game.pickOrder : bidOrder(game);
  return {
    hand: (
      <div className="sp-dock">
        <div className="dock-title">
          <Icon name="promote" size={18} /> 홍보 · 관객 모집
          <span className="quota">
            내 그룹 {me.groups.length}/{quota}
          </span>
        </div>
        <div className="pick-order" aria-label="고르는 순서">
          {order.map((id, i) => (
            <span key={id} className={`po ${id === me.id ? 'me' : ''} ${game.pickTurn === id && !game.pickDone[id] ? 'now' : ''}`}>
              {i + 1}. {id === me.id ? '나' : short(game.players[id].name)} ${game.players[id].bid}
            </span>
          ))}
        </div>
        <div className="hint">
          {mineTurn ? (
            <>
              데려올 <b>그룹을 탭</b>하세요. 아이콘은 좋아하는 유형, <b>$</b>는 1명이 낼 수 있는 최대 입장료예요.
            </>
          ) : game.pickDone[me.id] ? (
            <>모집을 마쳤어요</>
          ) : (
            <>다른 공원이 고르는 중이에요</>
          )}
        </div>
        <div className="vrow">
          {game.groupRow.map(({ g, by }) => (
            <GroupCard
              key={g}
              g={GROUP_BY_ID[g]}
              state={by === null ? 'open' : 'taken'}
              owner={by === null ? undefined : by === me.id ? '내 그룹' : short(game.players[by].name)}
              onTap={
                by === null
                  ? () => {
                      haptic(10);
                      act({ type: 'pickGroup', groupId: g });
                    }
                  : undefined
              }
              disabled={!mineTurn}
            />
          ))}
        </div>
        <small className="muted">그룹 덱 {game.groupDeck.length}장</small>
      </div>
    ),
    actions: (
      <button type="button" className="btn primary" disabled={!mineTurn} onClick={() => act({ type: 'donePicking' })}>
        {me.groups.length === 0 ? '모집 없이 진행' : '그만 데려오기'}
      </button>
    ),
  };
}

/** 운영 ① 입장료: 1인 입장료보다 지불 한도가 낮은 그룹은 돌아간다 */
function feeDock({ game, me, act }: DockProps): DockParts {
  const cap = feeCap(game);
  const groups = me.groups.map((id) => GROUP_BY_ID[id]);
  const people = (f: number) => groups.filter((g) => enters(g, f)).reduce((n, g) => n + sizeOf(g), 0);
  return {
    hand: (
      <div className="sp-dock">
        <div className="dock-title">
          <Icon name="ticket" size={18} /> 운영 · 입장료(1인)
        </div>
        <div className="vrow mine">
          {groups.length === 0 && <div className="muted pad">데려온 그룹이 없어요</div>}
          {groups.map((g) => (
            <GroupCard key={g.id} g={g} state="mine" enters={enters(g, me.fee)} />
          ))}
        </div>
        <div className="fees">
          {Array.from({ length: cap + 1 }, (_, f) => (
            <button
              type="button"
              key={f}
              className={`fee ${me.fee === f ? 'on' : ''}`}
              onClick={() => {
                haptic(8);
                act({ type: 'setFee', fee: f });
              }}
            >
              <Icon name="ticket" size={18} />
              <b>${f}</b>
              <small>
                {people(f)}명 · ${people(f) * f}
              </small>
            </button>
          ))}
        </div>
        <div className="promo-info">
          <div>
            <Icon name="adult" size={16} /> 입장 <b>{people(me.fee)}명</b> · 입장료 수입 <b>${people(me.fee) * me.fee}</b>
          </div>
          <small className="muted">
            입장한 그룹이 많을수록 상점 수익도 늘어요(그룹당).{cap < CFG.maxFee ? ` 이번 라운드 입장료는 최대 $${cap}.` : ''}
          </small>
        </div>
      </div>
    ),
    actions: (
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          haptic(20);
          act({ type: 'confirmFee' });
        }}
      >
        문 열기 <Icon name="arrow" size={18} />
      </button>
    ),
  };
}

/** 운영 ② 배치: 입장한 그룹을 놀이기구 1곳에 1개씩 */
function placeDock(p: DockProps): DockParts {
  const { act, setSelGroup } = p;
  return {
    hand: <PlaceHand {...p} />,
    actions: (
      <>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            haptic(8);
            setSelGroup(null);
            act({ type: 'clearPlace' });
          }}
        >
          비우기
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            haptic(8);
            setSelGroup(null);
            act({ type: 'autoPlace' });
          }}
        >
          <Icon name="sparkle" size={16} /> 추천
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            haptic(20);
            act({ type: 'confirmPlace' });
          }}
        >
          운영 시작
        </button>
      </>
    ),
  };
}

function PlaceHand({ game, me, selGroup, setSelGroup }: DockProps) {
  const r = useMemo(() => computeReport(game, me), [game, me]);
  const over = me.place.filter((slot, i) => slot !== null && slot !== undefined && fitOf(cardAt(me, slot)!, GROUP_BY_ID[me.groups[i]]) === 'over').length;
  const overMax = overflowOf(me);
  const wear = r.places.filter((l) => l.wear).length;
  return (
    <div className="sp-dock">
      <div className="dock-title">
        <Icon name="operate" size={18} /> 운영 · 그룹 배치
        {overMax > 0 && (
          <span className="quota">
            정원 초과 {over}/{overMax}
          </span>
        )}
      </div>
      <div className="hint">
        {selGroup !== null ? (
          <>
            배치할 <b>놀이기구를 탭</b>하세요 (점수와 수리 여부가 표시돼요)
          </>
        ) : (
          <>그룹을 탭해 고른 뒤 놀이기구를 탭하세요 · 놀이기구 1곳에 1그룹, 정원 이내 · 배치된 놀이기구를 탭하면 빼요</>
        )}
      </div>
      <div className="vrow mine">
        {me.groups.length === 0 && <div className="muted pad">입장한 그룹이 없어요</div>}
        {me.groups.map((id, i) => {
          const g = GROUP_BY_ID[id];
          const ok = enters(g, r.fee);
          const slot = me.place[i];
          return (
            <GroupCard
              key={id}
              g={g}
              state="mine"
              enters={ok ? undefined : false}
              placedAt={slot !== null && slot !== undefined ? cardAt(me, slot)!.name : undefined}
              selected={selGroup === i}
              onTap={
                ok
                  ? () => {
                      haptic(8);
                      setSelGroup(selGroup === i ? null : i);
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
      <div className="promo-info">
        <div>
          <Icon name="star" size={16} /> 예상 만족도{' '}
          <b>
            {r.sat >= 0 ? '+' : ''}
            {r.sat}
          </b>
          {r.unplaced.length > 0 && (
            <small className="neg">
              {' '}
              (미배치 {r.unplaced.length}그룹 -{r.unplacedSat})
            </small>
          )}
          {wear > 0 && <small> · 수리 토큰 {wear}</small>}
        </div>
      </div>
    </div>
  );
}

/** 관리: 수리·청소·인력 고용(라운드당 1명) */
function manageDock({ game, me, act, acts }: DockProps): DockParts {
  const repairs = me.facilities.flatMap((f, i) => (f?.repair ? [i] : []));
  const last = game.round >= game.maxRounds;
  const cleanAll = Math.min(me.trash, Math.floor(me.money / CFG.cleanCost));
  return {
    hand: (
      <div className="sp-dock">
        <div className="dock-title">
          <Icon name="manage" size={18} /> 관리
        </div>
        <p className="muted small">
          인력·부대시설이 무료 수리 {freeRepairsOf(me)}개, 무료 청소 {freeCleansOf(me)}개를 먼저 처리했어요.
        </p>
        <div className="manage">
          <div className="m-row">
            <Icon name="wrench" size={20} />
            <div>
              <b>수리 토큰 {repairs.length}개</b>
              <small>
                개당 ${CFG.repairCost} · 토큰이 있는 놀이기구는 운영 불가{last ? ' · 마지막 라운드라 수리할 필요 없어요' : ''}
              </small>
            </div>
            <div className="m-btns">
              {repairs.length === 0 ? (
                <span className="ok">
                  <Icon name="check" size={16} /> 이상 없음
                </span>
              ) : (
                repairs.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className="btn small repair"
                    disabled={me.money < CFG.repairCost}
                    onClick={() => {
                      haptic();
                      act({ type: 'repair', slot: s });
                    }}
                    aria-label={`${CARD_BY_ID[me.facilities[s]!.id].name} 수리`}
                  >
                    <span className="ell">{CARD_BY_ID[me.facilities[s]!.id].name}</span> 수리
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="m-row">
            <Icon name="trash" size={20} />
            <div>
              <b>쓰레기 {me.trash}개</b>
              <small>개당 ${CFG.cleanCost} · 남기면 라운드마다 1개당 만족도 -1</small>
            </div>
            <div className="m-btns">
              {me.trash === 0 ? (
                <span className="ok">
                  <Icon name="check" size={16} /> 깨끗해요
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn small"
                    disabled={me.money < CFG.cleanCost}
                    onClick={() => {
                      haptic();
                      act({ type: 'clean' });
                    }}
                  >
                    1개
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    disabled={me.money < CFG.cleanCost}
                    onClick={() => {
                      haptic();
                      acts(Array.from({ length: cleanAll }, (): Action => ({ type: 'clean' })));
                    }}
                  >
                    전부({cleanAll})
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="dock-sub">
          <Icon name="marketer" size={16} /> 인력 고용 <small className="muted">라운드당 1명{me.hired ? ' · 이번 라운드 완료' : ''}</small>
        </div>
        <div className="staff-list">
          {STAFF_KEYS.map((k) => {
            const lv = me.staff[k];
            const maxed = lv >= CFG.maxStaff;
            const cost = hireCost(lv);
            const m = STAFF_META[k];
            return (
              <div key={k} className="staff-item" style={{ ['--c' as string]: m.color }}>
                <Slot slot={`staff/${k}`} tint={m.color} className="staff-art" fallback={<Icon name={m.icon} size={22} />} />
                <div className="staff-info">
                  <b>
                    {m.label} <Pips level={lv} color={m.color} />
                  </b>
                  <small>{m.desc}</small>
                </div>
                <button
                  type="button"
                  className="btn small primary"
                  aria-label={`${m.label} 고용 ${maxed ? '최고 등급' : `$${cost}`}`}
                  disabled={me.hired || maxed || cost > me.money}
                  onClick={() => {
                    haptic();
                    act({ type: 'hire', staff: k });
                  }}
                >
                  {maxed ? 'MAX' : `$${cost}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    ),
    actions: (
      <button type="button" className="btn primary" onClick={() => act({ type: 'endManage' })}>
        라운드 종료{me.trash > 0 ? ` (쓰레기 -${me.trash})` : ''} <Icon name="arrow" size={18} />
      </button>
    ),
  };
}

function MarketCard({ card, me, selected, onTap }: { card: ParkCard; me: Player; selected: boolean; onTap: () => void }) {
  const price = priceOf(me, card);
  const afford = price <= me.money;
  return (
    <button type="button" className={`mcard ${selected ? 'sel' : ''} ${afford ? '' : 'dim'}`} onClick={onTap} aria-label={`${card.name} $${price}`}>
      <FacilityArt card={card} />
      <div className="mcard-top">
        <TypeChip type={card.type} />
        <span className={`price ${afford ? '' : 'short'}`}>${price}</span>
      </div>
      <b className="mcard-name">{card.name}</b>
      <FacilityStats card={card} />
      <p className="mcard-fx">{card.fx.text || ' '}</p>
    </button>
  );
}

function GameOver({ game, meId, onExit, onRematch, onClose }: { game: GameState; meId: number | null; onExit: () => void; onRematch?: () => void; onClose: () => void }) {
  const ranked = useMemo(() => rankings(game), [game]);
  const top = useMemo(() => winners(game), [game]);
  const won = top.some((p) => p.id === meId);
  const tie = top.length > 1;
  // 공동 순위: 만족도·잔액이 같으면 같은 등수
  const rankNo = ranked.map((p) => ranked.findIndex((q) => q.vp === p.vp && q.money === p.money) + 1);
  return (
    <Sheet tall label="게임 결과" onClose={onClose}>
      <div className="over">
        <div className={`trophy ${won ? 'won' : ''}`}>
          <Icon name="trophy" size={46} stroke={1.5} />
        </div>
        <h2>{won ? (tie ? '공동 1위! 최고의 놀이공원이에요' : '축하해요! 최고의 놀이공원이에요') : tie ? `${top.map((p) => p.name).join(' · ')} 공동 승리` : `${ranked[0].name}의 승리`}</h2>
        <p className="muted">{game.maxRounds}라운드가 끝났어요</p>
        <ol className="rank">
          {ranked.map((p, i) => (
            <li key={p.id} className={p.id === meId ? 'me' : ''} style={{ animationDelay: `${i * 90}ms` }}>
              <span className="rk">{rankNo[i]}</span>
              <span className="nm">
                {p.name}
                {!!p.endBonus && <small className="bonus"> (잔액 +{p.endBonus})</small>}
              </span>
              <Vp value={p.vp} />
              <Money value={p.money} />
            </li>
          ))}
        </ol>
        <p className="muted small">남은 돈 ${CFG.moneyPerVp}마다 만족도 +1이 이미 더해졌어요. 만족도가 같으면 남은 돈이 많은 쪽이 앞서요.</p>
        <div className="row over-cta">
          <button type="button" className="btn ghost" onClick={onClose}>
            공원 보기
          </button>
          {onRematch && (
            <button type="button" className="btn ghost" onClick={onRematch}>
              다시 하기
            </button>
          )}
          <button type="button" className="btn primary" onClick={onExit}>
            처음으로
          </button>
        </div>
      </div>
    </Sheet>
  );
}
