// 상단 고정 상태 줄(BGA 의 페이지 제목 줄): 메뉴·시대 정보, 지금 누가 무엇을 하는지, 퀘스트 선택 안내, 대외 단계(손의 습격·분쟁 카드)와 차례 종료 버튼
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ConflictDef, RaidDef, RaidEffect } from '../../core/types';
import { CONFLICT_LOSS_NAMES, RAID_EFFECT_NAMES } from '../describe';
import { CARD_DEFS } from '../../core/data/cards';
import { CONFLICT_DEFENSE, RAID_DEFENSE, raidAmount } from '../../core/data/constants';
import { attackValue, commandLeft, defenseLeft, defenseValue, edgeBonus, stage } from '../../core/engine/derive';
import { swarmValue } from '../../core/engine/external';
import { eraProgress } from '../../core/engine/era';
import { useApp } from '../../store/app';
import { useGame } from '../useGame';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import styles from './StatusBar.module.css';

const EFFECT_NAMES = RAID_EFFECT_NAMES;
const LOSS_NAMES = CONFLICT_LOSS_NAMES;

export function StatusBar({ onMenu, onLog, onResults }: { onMenu: () => void; onLog: () => void; onResults: () => void }) {
  const { game } = useGame();
  const canUndo = useApp((s) => s.canUndo);
  const undo = useApp((s) => s.undo);
  const prog = eraProgress(game);
  // 실제 높이를 --status-h 로 알려 보드 이동 여백·접힌 결정 버튼 위치에 쓴다(위 안전 영역 포함)
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--status-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <header className={styles.wrap} ref={ref}>
      <div className={styles.top}>
        <button className={styles.iconBtn} onClick={onMenu} aria-label="메뉴">
          ☰
        </button>
        <div className={styles.era} style={{ color: `var(--ring${Math.min(game.era, 3)})` }}>
          <strong key={game.era} className="anim-tick">
            {game.era <= 3 ? `${game.era}시대` : '종료 시대'}
          </strong>
          <span>
            <span key={game.round} className="anim-tick">
              {game.round}라운드
            </span>
            {game.era <= 3 ? ` · 시대 진행 ${prog.have}/${prog.need}` : game.endTriggered ? (game.round < (game.endRound ?? game.round) ? ' · 다음 라운드가 마지막' : ' · 마지막 라운드') : ''}
          </span>
        </div>
        {canUndo && undo && (
          <button className={styles.textBtn} onClick={undo}>
            되돌리기
          </button>
        )}
        <button className={styles.textBtn} onClick={onLog}>
          기록
        </button>
      </div>
      <ActionRow onResults={onResults} />
      <TurnCue />
    </header>
  );
}

function ActionRow({ onResults }: { onResults: () => void }) {
  const { game, me, myTurn, check, act } = useGame();
  const [sheet, setSheet] = useState<'raid' | 'conflict' | 'end' | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const p = game.players[me];
  // 손에서 지금 쓸 수 있는 습격·분쟁 카드(가져온 차례 제외)
  const usable = <T extends 'raid' | 'conflict'>(type: T) =>
    p.hand.flatMap((h, index) => {
      const def = CARD_DEFS[h.id];
      return def?.type === type && !h.fresh ? [{ index, def: def as Extract<RaidDef | ConflictDef, { type: T }> }] : [];
    });
  const raidCards = usable('raid');
  const conflictCards = usable('conflict');
  const close = () => {
    setSheet(null);
    setTarget(null);
    setPick(null);
  };
  const actor = game.pending.length ? game.pending[0].player : game.current;
  const others = game.players.filter((x) => x.id !== me);

  if (game.gameOver) {
    return (
      <div className={styles.bar}>
        <button className={`${styles.primary} anim-shine`} onClick={onResults}>
          결과 보기
        </button>
      </div>
    );
  }
  const counts = (
    <div className={styles.counts}>
      <span>
        <Icon name="command" size={14} /> {commandLeft(game, p)}
      </span>
      <span style={{ color: 'var(--danger)' }}>
        <Icon name="defense" size={14} /> {defenseLeft(p)}
      </span>
    </div>
  );
  if (!myTurn) {
    return (
      <div className={styles.bar}>
        {counts}
        <span className={styles.wait}>
          {game.pending.length && actor === me ? '결정을 기다리는 중' : `${game.players[actor].name}의 ${game.pending.length ? '결정' : '차례'}…`}
        </span>
      </div>
    );
  }
  if (game.phase === 'quest') {
    return (
      <div className={styles.bar}>
        {counts}
        <button className={`${styles.primary} anim-shine`} onClick={() => document.getElementById('quest-track')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}>
          퀘스트 고르기
        </button>
        <span className={styles.phase}>차례 처음 — 퀘스트 트랙에서 1장</span>
      </div>
    );
  }
  const external = game.phase === 'external';
  const t = target !== null ? game.players[target] : null;
  const raidCard = raidCards.find((c) => c.index === pick) ?? raidCards[0];
  const conflictCard = conflictCards.find((c) => c.index === pick) ?? conflictCards[0];
  const amount = raidAmount(game.era) + (raidCard?.def.bonus ?? 0);
  return (
    <>
      <div className={styles.bar}>
        {counts}
        {external ? (
          <div className={styles.ext}>
            <button onClick={() => setSheet('raid')} disabled={raidCards.length === 0} data-tip="습격" data-tip-body="손의 습격 카드 1장 + 방위 행동 2. 공격값이 상대 방어값보다 크면 카드에 적힌 자원을 약탈합니다.">
              습격
              <small>{raidCards.length ? `카드 ${raidCards.length}` : '카드 없음'}</small>
            </button>
            <button onClick={() => setSheet('conflict')} disabled={game.era < 2 || conflictCards.length === 0} data-tip="분쟁" data-tip-body={`손의 분쟁 카드 1장으로 선포. 다음 내 차례에 방위 행동 ${CONFLICT_DEFENSE}로 판정합니다.`}>
              분쟁
              <small>{game.era < 2 ? '2시대~' : conflictCards.length ? `카드 ${conflictCards.length}` : '카드 없음'}</small>
            </button>
          </div>
        ) : (
          <span className={styles.phase}>행동 단계 — 연구·건설 등</span>
        )}
        {/* 할 일을 다 했으면 차례 종료 버튼에 빛이 훑고 지나간다 */}
        <button className={`${styles.primary} ${commandLeft(game, p) === 0 ? 'anim-shine' : ''}`} onClick={() => (commandLeft(game, p) > 0 ? setSheet('end') : act({ type: 'endTurn' }))}>
          차례 종료
        </button>
      </div>

      {sheet === 'raid' && raidCard && (
        <Sheet
          title="습격"
          onClose={close}
          actions={
            t
              ? [
                  ...([...raidCard.def.effects, ...(stage(p, 'ark') >= 2 ? ['abduct'] : [])] as RaidEffect[]).map((e) => {
                    const a = { type: 'raid', card: raidCard.index, target: t.id, effect: e } as const;
                    return { label: `${EFFECT_NAMES[e]}${e === 'abduct' ? '' : ` ${amount}`} — 방위 ${RAID_DEFENSE}`, onClick: () => act(a), disabled: check(a) };
                  }),
                  ...(stage(p, 'symbiont') >= 2
                    ? [
                        (() => {
                          const a = { type: 'raid', card: raidCard.index, target: t.id, effect: raidCard.def.effects[0], swarm: true } as const;
                          return { label: `무리 몰이(판정 ${swarmValue(game, p)}) — 건물 1곳 하락 · 공생 +1`, onClick: () => act(a), disabled: check(a) };
                        })(),
                      ]
                    : []),
                ]
              : []
          }
        >
          <CardPicker cards={raidCards} current={raidCard.index} onPick={setPick} detail={(d) => `공격 ${d.atk ? `+${d.atk}` : '±0'}${d.bonus ? ` · 획득 +${d.bonus}` : ''} · ${d.effects.map((e) => EFFECT_NAMES[e]).join('·')}`} />
          <p>대상을 고르세요. 공격값이 방어값보다 커야 성공합니다. 실패해도 카드와 방위 행동은 돌아오지 않습니다.</p>
          <TargetPicker others={others} target={target} setTarget={setTarget} attack={(id) => attackValue(p, game.players[id]) + raidCard.def.atk} edge={(id) => edgeBonus(p, game.players[id])} harmed={(id) => game.players[id].harmedRound === game.round} />
        </Sheet>
      )}
      {sheet === 'conflict' && conflictCard && (
        <Sheet
          title="분쟁 선포"
          onClose={close}
          actions={
            t
              ? [
                  (() => {
                    const a = { type: 'declareConflict', card: conflictCard.index, target: t.id } as const;
                    return { label: `「${conflictCard.def.name}」 선포 — 노리는 손실: ${LOSS_NAMES[conflictCard.def.loss]}`, onClick: () => act(a), disabled: check(a) };
                  })(),
                ]
              : []
          }
        >
          <CardPicker cards={conflictCards} current={conflictCard.index} onPick={setPick} detail={(d) => `노리는 손실: ${LOSS_NAMES[d.loss]}${d.atk ? ` · 공격 +${d.atk}` : ''}`} />
          <p>다음 내 차례 시작에 방위 행동 {CONFLICT_DEFENSE}을 내고 판정합니다. 선포는 공개되어 상대가 대비할 수 있습니다. 지면 문화 −2.</p>
          <TargetPicker others={others} target={target} setTarget={setTarget} attack={(id) => attackValue(p, game.players[id]) + conflictCard.def.atk} edge={(id) => edgeBonus(p, game.players[id])} harmed={(id) => game.players[id].harmedRound === game.round} />
        </Sheet>
      )}
      {sheet === 'end' && (
        <Sheet title="차례 종료" onClose={() => setSheet(null)} actions={[{ label: '차례 종료', onClick: () => act({ type: 'endTurn' }) }]}>
          <p>
            지휘 행동이 {commandLeft(game, p)}개 남았습니다. 남은 방위 행동은 방위 태세(최대 +2)가 됩니다. 정말 끝낼까요?
          </p>
        </Sheet>
      )}
    </>
  );
}

/** 내 차례(또는 내 결정)가 오면 상태 줄 아래로 알림 띠가 잠깐 내려온다 */
function TurnCue() {
  const { game, me, myTurn } = useGame();
  const mine = myTurn || (game.pending.length > 0 && game.pending[0].player === me);
  const was = useRef(mine);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (mine && !was.current) setN((x) => x + 1);
    was.current = mine;
  }, [mine]);
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => setN(0), 1900);
    return () => clearTimeout(t);
  }, [n]);
  if (!n || game.gameOver) return null;
  // 상태 줄(backdrop-filter) 밖으로 꺼내야 화면 가운데에 고정된다
  return createPortal(
    <div key={n} className={`${styles.cue} anim-cue`} role="status">
      {myTurn ? '내 차례입니다' : '결정할 일이 있습니다'}
    </div>,
    document.body,
  );
}

/** 손의 습격·분쟁 카드 중 쓸 카드 고르기 */
function CardPicker<D extends { name: string }>({ cards, current, onPick, detail }: { cards: { index: number; def: D }[]; current: number; onPick: (i: number) => void; detail: (d: D) => string }) {
  return (
    <div className={styles.targets}>
      {cards.map((c) => (
        <button key={c.index} className={`${styles.target} ${c.index === current ? styles.on : ''}`} onClick={() => onPick(c.index)} aria-pressed={c.index === current}>
          <strong>{c.def.name}</strong>
          <span>{detail(c.def)}</span>
        </button>
      ))}
    </div>
  );
}

function TargetPicker({
  others,
  target,
  setTarget,
  attack,
  edge,
  harmed,
}: {
  others: { id: number; name: string }[];
  target: number | null;
  setTarget: (id: number) => void;
  attack: (id: number) => number;
  edge: (id: number) => number;
  harmed: (id: number) => boolean;
}) {
  const { game } = useGame();
  return (
    <div className={styles.targets}>
      {others.map((o) => {
        const atk = attack(o.id);
        const def = defenseValue(game.players[o.id]);
        return (
          <button key={o.id} className={`${styles.target} ${target === o.id ? styles.on : ''}`} onClick={() => setTarget(o.id)} disabled={harmed(o.id)}>
            <strong>{o.name}</strong>
            <span>
              공격 {atk} vs 방어 {def}
              {edge(o.id) ? ` (상성 ${edge(o.id) > 0 ? '+' : ''}${edge(o.id)})` : ''}
            </span>
            <span className={atk > def ? styles.win : styles.lose}>{harmed(o.id) ? '이번 라운드 피해 입음' : atk > def ? '성공 예상' : '실패 예상'}</span>
          </button>
        );
      })}
    </div>
  );
}
