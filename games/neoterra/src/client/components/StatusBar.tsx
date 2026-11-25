// 대국 화면 틀(GameShell)에 들어가는 상태·행동 부품: ① 지금 누가 무엇을 하는지·시대 정보, ④ 내 자원, ⑤ 행동 버튼(퀘스트 고르기·습격·분쟁·차례 종료·되돌리기),
// ③ 위의 첫 판 코치 안내, 내 차례 알림 띠
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ConflictDef, GameState, RaidDef, RaidEffect } from '../../engine/types';
import { RES_KEYS } from '../../engine/types';
import { CONFLICT_LOSS_NAMES, RAID_EFFECT_NAMES } from '../describe';
import { CARD_DEFS } from '../../engine/data/cards';
import { CONFLICT_DEFENSE, RAID_DEFENSE, RES_NAMES, raidAmount } from '../../engine/data/constants';
import { attackValue, commandLeft, defenseLeft, defenseValue, edgeBonus, stage } from '../../engine/rules/derive';
import { swarmValue } from '../../engine/rules/external';
import { eraProgress } from '../../engine/rules/era';
import { useApp } from '../store/app';
import { useGame } from '../useGame';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import styles from './StatusBar.module.css';

const EFFECT_NAMES = RAID_EFFECT_NAMES;
/** 첫 판 코치는 이 라운드까지만 */
const COACH_ROUNDS = 3;
const LOSS_NAMES = CONFLICT_LOSS_NAMES;

/** ① 상태바 첫 줄: 지금 누가 무엇을 하는지 */
export function TurnStatus() {
  const { game, me, myTurn, watching } = useGame();
  const actor = game.pending.length ? game.pending[0].player : game.current;
  let text: string;
  if (game.gameOver) text = '게임 종료';
  else if (!watching && game.pending.length && actor === me) text = '결정할 일이 있습니다';
  else if (!myTurn) text = `${game.players[actor].name}의 ${game.pending.length ? '결정' : '차례'}…`;
  else if (game.phase === 'quest') text = '퀘스트 트랙에서 1장 고르기';
  else if (game.phase === 'external') text = '대외 단계 — 습격·분쟁 또는 행동';
  else text = `행동 단계 — 지휘 ${commandLeft(game, game.players[me])} 남음`;
  return (
    <span key={text} className="anim-tick">
      {text}
    </span>
  );
}

/** ① 상태바 둘째 줄: 시대·라운드·시대 진행 */
export function EraDetail() {
  const { game } = useGame();
  const prog = eraProgress(game);
  return (
    <span>
      <strong style={{ color: `var(--ring${Math.min(game.era, 3)})` }}>{game.era <= 3 ? `${game.era}시대` : '종료 시대'}</strong> · {game.round}라운드
      {game.era <= 3 ? ` · 시대 진행 ${prog.have}/${prog.need}` : game.endTriggered ? (game.round < (game.endRound ?? game.round) ? ' · 다음 라운드가 마지막' : ' · 마지막 라운드') : ''}
    </span>
  );
}

/** ⑤ 행동 버튼: 퀘스트 고르기 · 습격 · 분쟁 · 차례 종료 · 되돌리기 · 결과 보기 */
export function ActionBar({ onResults, onQuest }: { onResults: () => void; onQuest: () => void }) {
  const { game, me, myTurn, offline, watching, check, act } = useGame();
  const canUndo = useApp((s) => s.canUndo);
  const undo = useApp((s) => s.undo);
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
  const others = game.players.filter((x) => x.id !== me);
  const undoButton = canUndo && undo && (
    <button className={styles.undo} onClick={undo}>
      되돌리기
    </button>
  );

  if (game.gameOver) {
    return (
      <button className={`${styles.primary} anim-shine`} onClick={onResults}>
        결과 보기
      </button>
    );
  }
  if (!myTurn) {
    const last = lastOtherLog(game, me);
    return (
      <span className={styles.wait}>
        <span>{watching ? '관전 중' : '다른 플레이어를 기다리는 중'}</span>
        {last && (
          <span key={game.log.length} className={`${styles.lastLog} anim-slide-in`}>
            {game.players[last.player!].name}: {last.text}
          </span>
        )}
      </span>
    );
  }
  if (game.phase === 'quest') {
    return (
      <>
        {undoButton}
        <button className={`${styles.primary} anim-shine`} onClick={onQuest}>
          퀘스트 고르기
        </button>
      </>
    );
  }
  const external = game.phase === 'external';
  const t = target !== null ? game.players[target] : null;
  const raidCard = raidCards.find((c) => c.index === pick) ?? raidCards[0];
  const conflictCard = conflictCards.find((c) => c.index === pick) ?? conflictCards[0];
  const amount = raidAmount(game.era) + (raidCard?.def.bonus ?? 0);
  return (
    <>
      {undoButton}
      {external && (
        <>
          <button className={styles.ext} onClick={() => setSheet('raid')} disabled={offline || raidCards.length === 0} data-tip="습격" data-tip-body="손의 습격 카드 1장 + 방위 행동 2. 공격값이 상대 방어값보다 크면 카드에 적힌 자원을 약탈합니다.">
            습격
            <small>{raidCards.length ? `카드 ${raidCards.length}` : '카드 없음'}</small>
          </button>
          <button className={styles.ext} onClick={() => setSheet('conflict')} disabled={offline || game.era < 2 || conflictCards.length === 0} data-tip="분쟁" data-tip-body={`손의 분쟁 카드 1장으로 선포. 다음 내 차례에 방위 행동 ${CONFLICT_DEFENSE}로 판정합니다.`}>
            분쟁
            <small>{game.era < 2 ? '2시대~' : conflictCards.length ? `카드 ${conflictCards.length}` : '카드 없음'}</small>
          </button>
        </>
      )}
      {/* 할 일을 다 했으면 차례 종료 버튼에 빛이 훑고 지나간다 */}
      <button className={`${styles.primary} ${commandLeft(game, p) === 0 ? 'anim-shine' : ''}`} disabled={offline} onClick={() => (commandLeft(game, p) > 0 ? setSheet('end') : act({ type: 'endTurn' }))}>
        차례 종료
      </button>

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

/** 상대 차례 동안 상태 줄에 보일 상대의 마지막 기록 1줄 */
function lastOtherLog(game: GameState, me: number) {
  for (let i = game.log.length - 1; i >= 0; i--) {
    const e = game.log[i];
    if (e.player !== null && e.player !== me) return e;
  }
  return null;
}

/** 안내 줄: 첫 판 코치(단계별) 또는 대외 단계 주의. 상태 줄 밖(테이블 스크롤 영역)에 둔다 */
export function Guide() {
  const { game, me, myTurn } = useGame();
  const coach = useApp((s) => s.settings.coach);
  const setSettings = useApp((s) => s.setSettings);
  if (!myTurn || game.gameOver) return null;
  const p = game.players[me];
  const left = commandLeft(game, p);
  if (coach && game.round <= COACH_ROUNDS) {
    const step =
      game.phase === 'quest'
        ? '① 퀘스트 트랙에서 카드 1장을 고르세요. 맨 앞 칸만 앞면이고, 뒷면도 고를 수 있습니다.'
        : game.phase === 'external'
          ? '② 대외 단계 — 손의 습격·분쟁 카드는 지금, 다른 행동보다 먼저만 낼 수 있습니다. 없으면 연구·건설로 넘어가세요.'
          : left > 0
            ? `③ 남은 지휘 ${left}개로 테크 웹 연구, 건설, 정착민 늘리기 등을 하세요.`
            : '④ 할 일을 다 했으면 차례 종료를 누르세요. 생산은 차례 끝에 들어옵니다.';
    return (
      <div className={styles.coach}>
        <span>{step}</span>
        <button className={styles.coachOff} onClick={() => setSettings({ coach: false })}>
          다시 보지 않기
        </button>
      </div>
    );
  }
  if (game.phase === 'external') return <p className={styles.hint}>습격·분쟁은 다른 행동보다 먼저 — 연구·건설 등을 하면 이번 차례 기회가 넘어갑니다</p>;
  return null;
}

/** ④ 내 영역: 내 자원(보유량)과 남은 지휘·방위 행동 한 줄 */
export function MyArea() {
  const { game, me } = useGame();
  const p = game.players[me];
  if (!p) return null;
  return (
    <div className={styles.res} role="group" aria-label={`내 자원 — ${RES_KEYS.map((k) => `${RES_NAMES[k]} ${p.res[k]}`).join(', ')}, 남은 지휘 ${commandLeft(game, p)}, 방위 ${defenseLeft(p)}`}>
      {RES_KEYS.map((k) => (
        <span key={k} style={{ color: `var(--res-${k})` }} aria-hidden>
          <Icon name={k} size={14} /> {p.res[k]}
        </span>
      ))}
      <span className={styles.sep} aria-hidden />
      <span aria-hidden>
        <Icon name="command" size={14} /> {commandLeft(game, p)}
      </span>
      <span style={{ color: 'var(--danger)' }} aria-hidden>
        <Icon name="defense" size={14} /> {defenseLeft(p)}
      </span>
    </div>
  );
}

/** 내 차례(또는 내 결정)가 오면 화면 가운데에 알림 띠가 잠깐 뜬다 */
export function TurnCue() {
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
