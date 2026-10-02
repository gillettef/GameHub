import { useEffect, useMemo, useRef, useState } from 'react';
import { CFG, HUMAN, incomeOf, isHumanTurn, priceOf, rankings, visitorQuota, type Action } from '../game/engine';
import { FACILITY_BY_ID } from '../game/data/facilities';
import { STAFF_KEYS, type FacilityCard, type GameState, type Player } from '../game/types';
import { haptic } from '../platform/storage';
import { Icon, type IconName } from './Icon';
import { Slot } from './Slot';
import { PHASES, STAFF_META, TYPE_META } from './meta';
import { FacilityArt, FacilityStats, Money, Num, Pips, Sheet, TypeChip, Vp, VisitorCard, VisitorChip } from './parts';
import { ReportSheet } from './Report';
import { RulesBody } from './Rules';

interface Props {
  game: GameState;
  act: (a: Action) => void;
  onExit: () => void;
}

type SheetState =
  | { kind: 'detail'; slot: number }
  | { kind: 'replace'; cardId: number; slot: number }
  | { kind: 'rules' }
  | { kind: 'log' }
  | { kind: 'menu' }
  | null;

export function GameScreen({ game, act, onExit }: Props) {
  const me = game.players[HUMAN];
  const [sheet, setSheet] = useState<SheetState>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<'market' | 'staff'>('market');
  const [viewId, setViewId] = useState(HUMAN);
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const view = game.players[viewId] ?? me;
  const mine = view.id === HUMAN;

  // 단계/라운드가 바뀌면 선택 초기화, 내 공원으로 복귀
  useEffect(() => {
    setSelected(null);
    setTab('market');
    setViewId(HUMAN);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [game.phase, game.round, game.promoteStep]);

  useEffect(() => {
    if (game.notice) {
      const n = Date.now();
      setToast({ msg: game.notice, n });
      haptic(30);
      const t = setTimeout(() => setToast((c) => (c && c.n === n ? null : c)), 1800);
      return () => clearTimeout(t);
    }
  }, [game]);

  // 카드를 고르면 내 공원으로 돌아와 부지가 보이게 스크롤
  useEffect(() => {
    if (selected !== null) {
      setViewId(HUMAN);
      slotsRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [selected]);

  // 선택한 카드가 팔리거나 사라지면 해제
  useEffect(() => {
    if (selected !== null && !game.market.includes(selected)) setSelected(null);
  }, [game.market, selected]);

  const myTurn = isHumanTurn(game);
  const selCard = selected !== null ? FACILITY_BY_ID[selected] : null;
  const brokenSlots = me.facilities.flatMap((f, i) => (f?.broken ? [i] : []));
  const viewBroken = view.facilities.filter((f) => f?.broken).length;
  const feeStep = game.phase === 'promote' && game.promoteStep === 'fee';
  const recent = game.log.filter((l) => !/^\d+라운드 ·/.test(l)).slice(-3);

  const tapSlot = (i: number) => {
    const f = view.facilities[i];
    if (mine && selCard && myTurn) {
      if (!f) {
        haptic();
        act({ type: 'buy', cardId: selCard.id, slot: i });
        setSelected(null);
      } else {
        setSheet({ kind: 'replace', cardId: selCard.id, slot: i });
      }
      return;
    }
    if (f) setSheet({ kind: 'detail', slot: i });
  };

  const buy = (cardId: number, slot: number) => {
    haptic();
    act({ type: 'buy', cardId, slot });
    setSelected(null);
    setSheet(null);
  };

  return (
    <div className="game">
      <Slot slot="ui/park-bg" className="game-bg" tint="#1b1640" />
      <header className="topbar">
        <button className="icon-btn" onClick={() => setSheet({ kind: 'menu' })} aria-label="메뉴">
          <Icon name="log" size={22} />
        </button>
        <div className="round">
          <b>{Math.min(game.round, game.maxRounds)}</b>
          <span>/ {game.maxRounds} 라운드</span>
        </div>
        <button className="icon-btn" onClick={() => setSheet({ kind: 'rules' })} aria-label="규칙">
          <Icon name="help" size={22} />
        </button>
      </header>

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

      <div className="score-wrap">
        <Scoreboard game={game} viewId={view.id} onView={(id) => { haptic(8); setViewId(id); setSelected(null); }} />
      </div>

      <div className="scroll" ref={scrollRef}>
        {game.event && (
          <div className="event">
            <Slot slot={`event/${game.event.id}`} tint="#6a4cff" className="event-art" fallback={<Icon name={game.event.icon as IconName} size={24} />} />
            <div className="event-txt">
              <small>오늘의 운영카드</small>
              <b>{game.event.name}</b>
              <span>{game.event.desc}</span>
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <ul className="ticker" aria-label="최근 소식">
            {recent.map((l, i) => (
              <li key={game.log.length + '-' + i}>{l}</li>
            ))}
          </ul>
        )}

        <section className={`board ${mine ? '' : 'rival'}`}>
          <div className="board-head">
            <div className="board-title">
              <Slot slot="visitor/adult" tint={mine ? '#ffd54a' : `hsl(${view.id * 70} 70% 60%)`} className="avatar" fallback={<Icon name="smile" size={22} />} />
              <div>
                <b>{view.name}</b>
                <small>
                  {mine ? '내 공원' : '상대 공원 (보기 전용)'} · 시설 {view.facilities.filter(Boolean).length}/{CFG.slots}
                </small>
              </div>
            </div>
            <div className="board-res">
              <Money value={view.money} big />
              <Vp value={view.vp} big />
            </div>
          </div>

          <div className="slots" ref={slotsRef}>
            {view.facilities.map((f, i) => {
              const c = f ? FACILITY_BY_ID[f.id] : null;
              const target = mine && !!selCard && myTurn;
              return (
                <button key={i} className={`tile ${c ? '' : 'empty'} ${target ? 'target' : ''} ${f?.broken ? 'broken' : ''}`} onClick={() => tapSlot(i)}>
                  {c ? (
                    <>
                      <FacilityArt card={c} />
                      <div className="tile-name">{c.name}</div>
                      <div className="tile-stat">
                        <span><Icon name="coin" size={11} />{incomeOf(c, 'child')}/{incomeOf(c, 'adult')}</span>
                        <span><Icon name="star" size={11} />{c.sat[0]}/{c.sat[1]}</span>
                      </div>
                      <span className="tile-type" style={{ ['--c' as string]: TYPE_META[c.type].color }}>
                        <Icon name={TYPE_META[c.type].icon} size={12} stroke={2} />
                      </span>
                      {f?.broken && (
                        <div className="tile-broken">
                          <Icon name="crack" size={26} />
                          <b>고장</b>
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
                  className="staff-chip"
                  style={{ ['--c' as string]: STAFF_META[k].color }}
                  onClick={() => {
                    if (mine && game.phase === 'construct') {
                      setSelected(null);
                      setTab('staff');
                    }
                  }}
                  title={`${STAFF_META[k].label}: ${STAFF_META[k].desc}`}
                >
                  <Icon name={STAFF_META[k].icon} size={18} />
                  <Pips level={view.staff[k]} color={STAFF_META[k].color} />
                </button>
              ))}
            </div>
            <div className="tokens">
              <span className={`token ${view.trash > 0 ? 'warn' : ''}`} title="쓰레기 토큰">
                <Icon name="trash" size={15} />
                <Num value={view.trash} />
              </span>
              <span className={`token ${viewBroken > 0 ? 'bad' : ''}`} title="수리 토큰">
                <Icon name="wrench" size={15} />
                <Num value={viewBroken} />
              </span>
            </div>
          </div>

          {view.visitors.length > 0 && game.phase !== 'construct' && (
            <div className="entrance">
              <span className="entrance-label">
                <Icon name="ticket" size={14} /> 입구
                {feeStep || game.phase === 'operate' || game.phase === 'manage' ? ` · 입장료 $${view.fee}` : ''}
              </span>
              <div className="entrance-row">
                {view.visitors.map((v) => (
                  <VisitorChip key={v.id} v={v} enters={game.phase === 'promote' && game.promoteStep === 'pick' ? undefined : v.budget >= view.fee} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <Dock
        game={game}
        me={me}
        act={act}
        tab={tab}
        setTab={setTab}
        selected={selected}
        setSelected={setSelected}
        myTurn={myTurn}
        brokenSlots={brokenSlots}
        viewMine={mine}
        goMine={() => setViewId(HUMAN)}
      />

      {game.phase === 'operate' && <ReportSheet game={game} onNext={() => act({ type: 'continue' })} />}
      {game.phase === 'gameOver' && <GameOver game={game} onExit={onExit} />}

      {sheet?.kind === 'detail' && view.facilities[sheet.slot] && (
        <DetailSheet
          card={FACILITY_BY_ID[view.facilities[sheet.slot]!.id]}
          broken={view.facilities[sheet.slot]!.broken}
          canRepair={mine && game.phase === 'manage' && me.money >= CFG.repairCost}
          phaseManage={mine && game.phase === 'manage'}
          onRepair={() => act({ type: 'repair', slot: sheet.slot })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'replace' && (
        <Sheet title="철거하고 새로 지을까요?" onClose={() => setSheet(null)}>
          <div className="replace">
            <MiniCard card={FACILITY_BY_ID[me.facilities[sheet.slot]!.id]} label="철거" />
            <Icon name="arrow" size={22} />
            <MiniCard card={FACILITY_BY_ID[sheet.cardId]} label="건설" />
          </div>
          <p className="muted center">기존 시설은 환불 없이 사라져요.</p>
          <div className="row">
            <button className="btn ghost" onClick={() => setSheet(null)}>취소</button>
            <button className="btn primary" onClick={() => buy(sheet.cardId, sheet.slot)}>
              <Icon name="build" size={18} /> 건설 (${priceOf(me, FACILITY_BY_ID[sheet.cardId])})
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
            {[...game.log].reverse().map((l, i) => (
              <li key={i} className={/^\d+라운드 ·/.test(l) ? 'head' : ''}>{l}</li>
            ))}
          </ul>
        </Sheet>
      )}
      {sheet?.kind === 'menu' && (
        <Sheet title="메뉴" onClose={() => setSheet(null)}>
          <div className="menu">
            <button className="btn ghost" onClick={() => setSheet({ kind: 'log' })}><Icon name="log" size={18} /> 진행 기록</button>
            <button className="btn ghost" onClick={() => setSheet({ kind: 'rules' })}><Icon name="help" size={18} /> 규칙 보기</button>
            <button className="btn danger" onClick={onExit}><Icon name="close" size={18} /> 타이틀로 (자동 저장됨)</button>
          </div>
        </Sheet>
      )}

      {toast && <div className="toast" key={toast.n}>{toast.msg}</div>}
    </div>
  );
}

/** 모든 플레이어를 한눈에 보고, 탭하면 그 공원을 열람한다 */
function Scoreboard({ game, viewId, onView }: { game: GameState; viewId: number; onView: (id: number) => void }) {
  return (
    <div className="score" role="tablist" aria-label="공원 보기">
      {game.players.map((p) => {
        const turn =
          (game.phase === 'construct' && game.turn === p.id) || (game.phase === 'promote' && game.promoteStep === 'pick' && game.pickTurn === p.id);
        return (
          <button key={p.id} role="tab" aria-selected={viewId === p.id} className={`pl ${p.id === HUMAN ? 'me' : ''} ${viewId === p.id ? 'view' : ''} ${turn ? 'turn' : ''}`} onClick={() => onView(p.id)}>
            <span className="pl-ico" style={{ ['--h' as string]: p.id * 70 }}>
              <Icon name="smile" size={16} />
            </span>
            <span className="pl-name">
              {p.name}
              {game.first === p.id && game.phase !== 'gameOver' && <em className="first">선</em>}
            </span>
            <span className="pl-res">
              <Vp value={p.vp} />
              <Money value={p.money} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MiniCard({ card, label }: { card: FacilityCard; label: string }) {
  return (
    <div className="mini">
      <FacilityArt card={card} />
      <b>{card.name}</b>
      <small>{label}</small>
    </div>
  );
}

function DetailSheet({ card, broken, canRepair, phaseManage, onRepair, onClose }: { card: FacilityCard; broken: boolean; canRepair: boolean; phaseManage: boolean; onRepair: () => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <FacilityArt card={card} className="art-lg" />
      <div className="detail-head">
        <h2>{card.name}</h2>
        <TypeChip type={card.type} />
      </div>
      <FacilityStats card={card} />
      {card.effect && <p className="effect"><Icon name="sparkle" size={14} /> {card.effect}</p>}
      <p className="muted small">수익은 방문 1회당 금액, 만족도는 모아서 {CFG.satPerVp}점마다 VP 1점이 돼요.</p>
      {broken && (
        <div className="callout bad">
          <Icon name="crack" size={20} />
          <div>
            <b>고장났어요</b>
            <span>수리할 때까지 운영하지 못해요. (유지비는 계속 나가요)</span>
          </div>
          {phaseManage && (
            <button className="btn small primary" disabled={!canRepair} onClick={() => { onRepair(); onClose(); }}>
              수리 ${CFG.repairCost}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ───────── 하단 도크 ───────── */

interface DockProps {
  game: GameState;
  me: Player;
  act: (a: Action) => void;
  tab: 'market' | 'staff';
  setTab: (t: 'market' | 'staff') => void;
  selected: number | null;
  setSelected: (id: number | null) => void;
  myTurn: boolean;
  brokenSlots: number[];
  viewMine: boolean;
  goMine: () => void;
}

function Dock({ game, me, act, tab, setTab, selected, setSelected, myTurn, brokenSlots, viewMine, goMine }: DockProps) {
  if (game.phase === 'construct') {
    return (
      <footer className="dock">
        <div className="tabs">
          <button className={tab === 'market' ? 'on' : ''} onClick={() => setTab('market')}><Icon name="build" size={16} /> 시설 시장</button>
          <button className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')}><Icon name="marketer" size={16} /> 인력 고용</button>
          <button className="end" onClick={() => act({ type: 'pass' })} disabled={!myTurn}>건설 마치기 <Icon name="arrow" size={16} /></button>
        </div>
        {tab === 'market' ? (
          <>
            <div className="hint">
              {selected !== null ? (
                <>건설할 <b>부지를 탭</b>하세요 <button className="link" onClick={() => setSelected(null)}>선택 취소</button></>
              ) : !viewMine ? (
                <>상대 공원을 보는 중이에요 <button className="link" onClick={goMine}>내 공원으로</button></>
              ) : (
                <>카드를 탭해 고른 뒤 부지에 건설해요 · 상대 이름을 탭하면 상대 공원을 볼 수 있어요</>
              )}
            </div>
            <div className="market">
              {game.market.length === 0 && <div className="muted pad">시장이 비었어요</div>}
              {game.market.map((id) => (
                <MarketCard key={id} card={FACILITY_BY_ID[id]} me={me} selected={selected === id} onTap={() => { haptic(8); setSelected(selected === id ? null : id); }} />
              ))}
            </div>
          </>
        ) : (
          <div className="staff-list">
            {STAFF_KEYS.map((k) => {
              const lv = me.staff[k];
              const maxed = lv >= CFG.maxStaff;
              const cost = CFG.hireCost(lv);
              const m = STAFF_META[k];
              return (
                <div key={k} className="staff-item" style={{ ['--c' as string]: m.color }}>
                  <Slot slot={`staff/${k}`} tint={m.color} className="staff-art" fallback={<Icon name={m.icon} size={22} />} />
                  <div className="staff-info">
                    <b>{m.label} <Pips level={lv} color={m.color} /></b>
                    <small>{m.desc}</small>
                  </div>
                  <button className="btn small primary" disabled={!myTurn || maxed || cost > me.money} onClick={() => { haptic(); act({ type: 'hire', staff: k }); }}>
                    {maxed ? 'MAX' : `$${cost}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </footer>
    );
  }

  if (game.phase === 'promote') return game.promoteStep === 'pick' ? <PickDock game={game} me={me} act={act} /> : <FeeDock me={me} act={act} />;

  if (game.phase === 'manage') {
    const penalty = Math.floor(me.trash / 2);
    const cleanable = Math.min(me.trash, me.money);
    return (
      <footer className="dock">
        <div className="dock-title"><Icon name="manage" size={18} /> 관리 · 남은 문제를 정리하세요</div>
        <p className="muted small">인력이 먼저 자동으로 처리했어요. 남은 것만 돈으로 해결할 수 있어요.</p>
        <div className="manage">
          <div className="m-row">
            <Icon name="wrench" size={20} />
            <div><b>고장 시설 {brokenSlots.length}곳</b><small>시설을 탭하거나 수리 버튼 (${CFG.repairCost})</small></div>
            <div className="m-btns">
              {brokenSlots.length === 0 ? <span className="ok"><Icon name="check" size={16} /> 이상 없음</span> : brokenSlots.map((s) => (
                <button key={s} className="btn small" disabled={me.money < CFG.repairCost} onClick={() => { haptic(); act({ type: 'repair', slot: s }); }}>
                  {FACILITY_BY_ID[me.facilities[s]!.id].name} 수리
                </button>
              ))}
            </div>
          </div>
          <div className="m-row">
            <Icon name="trash" size={20} />
            <div><b>쓰레기 {me.trash}개</b><small>개당 ${CFG.cleanCost} · 2개마다 VP -1</small></div>
            <div className="m-btns">
              {me.trash === 0 ? <span className="ok"><Icon name="check" size={16} /> 깨끗해요</span> : (
                <>
                  <button className="btn small" disabled={cleanable < 1} onClick={() => { haptic(); act({ type: 'clean' }); }}>1개</button>
                  <button className="btn small" disabled={cleanable < 1} onClick={() => { haptic(); for (let i = 0; i < cleanable; i++) act({ type: 'clean' }); }}>전부({cleanable})</button>
                </>
              )}
            </div>
          </div>
        </div>
        <button className="btn primary wide" onClick={() => act({ type: 'endManage' })}>
          라운드 종료{penalty > 0 ? ` (쓰레기 감점 -${penalty})` : ''} <Icon name="arrow" size={18} />
        </button>
      </footer>
    );
  }
  return null;
}

/** 홍보 ① 관객 트랙: 공개된 관객카드를 차례로 가져온다 */
function PickDock({ game, me, act }: { game: GameState; me: Player; act: (a: Action) => void }) {
  const quota = visitorQuota(game, me);
  const mineTurn = game.pickTurn === HUMAN && !game.pickDone[HUMAN];
  const open = game.visitorRow.filter((r) => r.by === null).length;
  return (
    <footer className="dock">
      <div className="dock-title">
        <Icon name="promote" size={18} /> 홍보 · 관객 트랙
        <span className="quota">내 입구 {me.visitors.length}/{quota}</span>
      </div>
      <div className="hint">
        {mineTurn ? (
          <>마음에 드는 <b>관객을 탭</b>해 입구로 데려오세요. 아이콘은 좋아하는 시설 유형, <b>$</b>는 낼 수 있는 최대 입장료예요.</>
        ) : (
          <>관객 선택이 끝났어요</>
        )}
      </div>
      <div className="vrow">
        {game.visitorRow.map(({ v, by }) => (
          <VisitorCard
            key={v.id}
            v={v}
            state={by === null ? 'open' : 'taken'}
            owner={by === null ? undefined : by === HUMAN ? '내 입구' : game.players[by].name.replace(' 파크', '')}
            onTap={by === null ? () => { haptic(10); act({ type: 'pickVisitor', visitorId: v.id }); } : undefined}
            disabled={!mineTurn}
          />
        ))}
      </div>
      <div className="vfoot">
        <small className="muted">남은 관객 {open}명 · 관객 덱 {game.visitorDeck.length}장</small>
        <button className="btn small" disabled={!mineTurn} onClick={() => act({ type: 'donePicking' })}>
          {me.visitors.length === 0 ? '관객 없이 진행' : '이 정도면 됐어요'}
        </button>
      </div>
    </footer>
  );
}

/** 홍보 ② 입장료 결정: 내 입구의 관객이 입장 가능한지 바로 보인다 */
function FeeDock({ me, act }: { me: Player; act: (a: Action) => void }) {
  const entered = me.visitors.filter((v) => v.budget >= me.fee).length;
  return (
    <footer className="dock">
      <div className="dock-title"><Icon name="ticket" size={18} /> 홍보 · 입장료를 정하세요</div>
      <div className="vrow mine">
        {me.visitors.length === 0 && <div className="muted pad">데려온 관객이 없어요</div>}
        {me.visitors.map((v) => (
          <VisitorCard key={v.id} v={v} state="mine" enters={v.budget >= me.fee} />
        ))}
      </div>
      <div className="fees">
        {Array.from({ length: CFG.maxFee + 1 }, (_, f) => {
          const n = me.visitors.filter((v) => v.budget >= f).length;
          return (
            <button key={f} className={`fee ${me.fee === f ? 'on' : ''}`} onClick={() => { haptic(8); act({ type: 'setFee', fee: f }); }}>
              <Icon name="ticket" size={18} />
              <b>${f}</b>
              <small>{n}명 · ${n * f}</small>
            </button>
          );
        })}
      </div>
      <div className="promo-info">
        <div><Icon name="adult" size={16} /> 입장 <b>{entered}/{me.visitors.length}명</b> · 입장료 수입 <b>${entered * me.fee}</b></div>
        <small className="muted">입장료보다 한도가 낮은 관객은 입구에서 돌아가요. 입장하는 관객이 많을수록 시설 수익·만족도도 늘어요.</small>
      </div>
      <button className="btn primary wide" onClick={() => { haptic(20); act({ type: 'confirmFee' }); }}>
        문 열기 <Icon name="arrow" size={18} />
      </button>
    </footer>
  );
}

function MarketCard({ card, me, selected, onTap }: { card: FacilityCard; me: Player; selected: boolean; onTap: () => void }) {
  const price = priceOf(me, card);
  const afford = price <= me.money;
  const disc = price < card.cost;
  return (
    <button className={`mcard ${selected ? 'sel' : ''} ${afford ? '' : 'dim'}`} onClick={onTap}>
      <FacilityArt card={card} />
      <div className="mcard-top">
        <TypeChip type={card.type} />
        <span className={`price ${afford ? '' : 'short'}`}>
          {disc && <s>${card.cost}</s>}${price}
        </span>
      </div>
      <b className="mcard-name">{card.name}</b>
      <FacilityStats card={card} />
      <p className="mcard-fx">{card.effect || ' '}</p>
    </button>
  );
}

function GameOver({ game, onExit }: { game: GameState; onExit: () => void }) {
  const ranked = useMemo(() => rankings(game), [game]);
  const won = ranked[0].id === HUMAN;
  return (
    <Sheet tall>
      <div className="over">
        <div className={`trophy ${won ? 'won' : ''}`}><Icon name="trophy" size={46} stroke={1.5} /></div>
        <h2>{won ? '축하해요! 최고의 놀이공원이에요' : `${ranked[0].name}의 승리`}</h2>
        <p className="muted">{game.maxRounds}라운드가 끝났어요</p>
        <ol className="rank">
          {ranked.map((p, i) => (
            <li key={p.id} className={p.id === HUMAN ? 'me' : ''} style={{ animationDelay: `${i * 90}ms` }}>
              <span className="rk">{i + 1}</span>
              <span className="nm">{p.name}</span>
              <Vp value={p.vp} />
              <Money value={p.money} />
            </li>
          ))}
        </ol>
        <p className="muted small">VP가 같으면 남은 돈이 많은 쪽이 앞서요.</p>
        <button className="btn primary wide" onClick={onExit}>타이틀로</button>
      </div>
    </Sheet>
  );
}
