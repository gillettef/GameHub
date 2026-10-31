// 상단 고정 상태 줄(BGA 의 페이지 제목 줄): 메뉴·시대 정보, 지금 누가 무엇을 하는지, 대외 단계(습격·분쟁·트랙 당기기)와 차례 종료 버튼
import { useEffect, useRef, useState } from 'react';
import type { ConflictLoss, RaidEffect } from '../../core/types';
import { CONFLICT_DEFENSE, PULL_DEFENSE, RAID_DEFENSE, raidAmount } from '../../core/data/constants';
import { attackValue, commandLeft, defenseLeft, defenseValue, edgeBonus, stage } from '../../core/engine/derive';
import { swarmValue } from '../../core/engine/external';
import { eraProgress } from '../../core/engine/era';
import { useGame } from '../useGame';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import styles from './StatusBar.module.css';

const EFFECT_NAMES: Record<RaidEffect, string> = {
  lootProd: '생산 약탈',
  lootFood: '식량 약탈',
  stealSci: '과학 탈취',
  stealEnergy: '에너지 탈취',
  abduct: '정착민 납치',
};
const LOSS_NAMES: Record<ConflictLoss, string> = { culture: '문화', building: '건물', doctrine: '노선 점수' };

export function StatusBar({ onMenu, onLog, onResults }: { onMenu: () => void; onLog: () => void; onResults: () => void }) {
  const { game } = useGame();
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
          <strong>{game.era <= 3 ? `${game.era}시대` : '종료 시대'}</strong>
          <span>
            {game.round}라운드
            {game.era <= 3 ? ` · 시대 진행 ${prog.have}/${prog.need}` : game.endTriggered ? ' · 마지막 라운드' : ''}
          </span>
        </div>
        <button className={styles.textBtn} onClick={onLog}>
          기록
        </button>
      </div>
      <ActionRow onResults={onResults} />
    </header>
  );
}

function ActionRow({ onResults }: { onResults: () => void }) {
  const { game, me, myTurn, check, act } = useGame();
  const [sheet, setSheet] = useState<'raid' | 'conflict' | 'pull' | 'end' | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const p = game.players[me];
  const actor = game.pending.length ? game.pending[0].player : game.current;
  const others = game.players.filter((x) => x.id !== me);

  if (game.gameOver) {
    return (
      <div className={styles.bar}>
        <button className={styles.primary} onClick={onResults}>
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
  const external = game.phase === 'external';
  const t = target !== null ? game.players[target] : null;
  const amount = raidAmount(game.era);
  return (
    <>
      <div className={styles.bar}>
        {counts}
        {external ? (
          <div className={styles.ext}>
            <button onClick={() => setSheet('raid')} data-tip="습격" data-tip-body="방위 행동 2. 공격값이 상대 방어값보다 크면 자원을 약탈합니다.">
              습격
            </button>
            <button onClick={() => setSheet('conflict')} disabled={game.era < 2}>
              분쟁
              {game.era < 2 && <small>2시대~</small>}
            </button>
            <button onClick={() => setSheet('pull')} data-tip="트랙 당기기" data-tip-body="방위 행동 1. 칸 1의 퀘스트를 지금 처리하고 한 칸 당깁니다. 문화 +시대.">
              당기기
            </button>
          </div>
        ) : (
          <span className={styles.phase}>행동 단계 — 연구·카드·건설 등</span>
        )}
        <button className={styles.primary} onClick={() => (commandLeft(game, p) > 0 ? setSheet('end') : act({ type: 'endTurn' }))}>
          차례 종료
        </button>
      </div>

      {sheet === 'raid' && (
        <Sheet
          title="습격"
          onClose={() => {
            setSheet(null);
            setTarget(null);
          }}
          actions={
            t
              ? [
                  ...(['lootProd', 'lootFood', 'stealSci', 'stealEnergy', ...(stage(p, 'ark') >= 2 ? ['abduct'] : [])] as RaidEffect[]).map((e) => ({
                    label: `${EFFECT_NAMES[e]}${e === 'abduct' ? '' : ` ${amount}`} — 방위 ${RAID_DEFENSE}`,
                    onClick: () => act({ type: 'raid', target: t.id, effect: e }),
                    disabled: check({ type: 'raid', target: t.id, effect: e }),
                  })),
                  ...(stage(p, 'symbiont') >= 2
                    ? [
                        {
                          label: `무리 몰이(판정 ${swarmValue(game, p)}) — 건물 1곳 하락 · 공생 +1`,
                          onClick: () => act({ type: 'raid', target: t.id, effect: 'lootProd', swarm: true }),
                          disabled: check({ type: 'raid', target: t.id, effect: 'lootProd', swarm: true }),
                        },
                      ]
                    : []),
                ]
              : []
          }
        >
          <p>대상을 고르세요. 공격값이 방어값보다 커야 성공합니다. 실패해도 방위 행동은 돌아오지 않습니다.</p>
          <TargetPicker others={others} target={target} setTarget={setTarget} attack={(id) => attackValue(p, game.players[id])} edge={(id) => edgeBonus(p, game.players[id])} harmed={(id) => game.players[id].harmedRound === game.round} />
        </Sheet>
      )}
      {sheet === 'conflict' && (
        <Sheet
          title="분쟁 선포"
          onClose={() => {
            setSheet(null);
            setTarget(null);
          }}
          actions={
            t
              ? (['culture', 'building', 'doctrine'] as ConflictLoss[]).map((loss) => ({
                  label: `노리는 손실: ${LOSS_NAMES[loss]}`,
                  onClick: () => act({ type: 'declareConflict', target: t.id, loss }),
                  disabled: check({ type: 'declareConflict', target: t.id, loss }),
                }))
              : []
          }
        >
          <p>다음 내 차례 시작에 방위 행동 {CONFLICT_DEFENSE}을 내고 판정합니다. 선포는 공개되어 상대가 대비할 수 있습니다. 지면 문화 −2.</p>
          <TargetPicker others={others} target={target} setTarget={setTarget} attack={(id) => attackValue(p, game.players[id])} edge={(id) => edgeBonus(p, game.players[id])} harmed={(id) => game.players[id].harmedRound === game.round} />
        </Sheet>
      )}
      {sheet === 'pull' && (
        <Sheet
          title="퀘스트 트랙 당기기"
          onClose={() => setSheet(null)}
          actions={[{ label: `당기기 — 방위 ${PULL_DEFENSE}, 문화 +${Math.min(game.era, 3)}`, onClick: () => act({ type: 'pullTrack' }), disabled: check({ type: 'pullTrack' }) }]}
        >
          <p>칸 1의 퀘스트를 지금 처리하고 트랙을 한 칸 당깁니다. 위성 시야로 다음 퀘스트를 알고 있을 때 유리한 퀘스트를 앞당기거나, 상대가 준비하기 전에 위협을 터뜨릴 수 있습니다.</p>
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
