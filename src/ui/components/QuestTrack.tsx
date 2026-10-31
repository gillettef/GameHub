// 퀘스트 트랙: 공개 2칸(임박·다음) + 미래 더미(위성 시야만큼 앞면)
import { useState } from 'react';
import type { QuestDef } from '../../core/types';
import { QUEST_DEFS } from '../../core/data/quests';
import { DOCTRINE_NAMES } from '../../core/data/constants';
import { meets, playerMods } from '../../core/engine/derive';
import { HIDDEN } from '../../core/mask';
import { useGame } from '../useGame';
import { CardFace, type FrameName } from './CardFace';
import { Icon, type IconName } from './Icon';
import { CardZoom } from './CardZoom';
import { QuestBrief } from './CardBrief';
import { useCardSizes } from '../useCardSizes';
import { Section } from './Section';
import { Sheet, type SheetAction } from './Sheet';
import { QUEST_KIND_NAMES, optionText, questSummary } from '../describe';
import styles from './QuestTrack.module.css';

const FRAME: Record<QuestDef['kind'], FrameName> = {
  judge: 'quest-judge',
  threat: 'quest-threat',
  contest: 'quest-contest',
  patron: 'quest-patron',
  fruition: 'quest-fruition',
  finale: 'quest-finale',
};

const ICON: Record<QuestDef['kind'], IconName> = { judge: 'quest', threat: 'threat', contest: 'workshop', patron: 'patron', fruition: 'legacy', finale: 'legacy' };
const TONE: Record<QuestDef['kind'], string> = { judge: 'var(--res-sci)', threat: 'var(--danger)', contest: 'var(--warn)', patron: 'var(--ring2)', fruition: 'var(--ring3)', finale: 'var(--ring3)' };
export const questArt = (q: QuestDef) => ({ id: q.id, icon: q.kind === 'fruition' ? q.doctrine : ICON[q.kind], tone: TONE[q.kind] });

export function QuestFace({ q, width, onClick }: { q: QuestDef; width: number; onClick?: () => void }) {
  return (
    <CardFace
      tip={`${QUEST_KIND_NAMES[q.kind]}\n${questSummary(q)}`}
      art={questArt(q)}
      frame={FRAME[q.kind]}
      width={width}
      title={q.name}
      kind={QUEST_KIND_NAMES[q.kind]}
      badge={q.kind === 'threat' ? q.power : undefined}
      body={width >= 120 ? questSummary(q) : undefined}
      brief={<QuestBrief q={q} />}
      onClick={onClick}
    />
  );
}

export function QuestTrack() {
  const { game, me, check, act } = useGame();
  const sizes = useCardSizes();
  const [open, setOpen] = useState<{ id: string; slot: number | null } | null>(null);
  const sight = playerMods(game.players[me]).sight;
  const future = game.questFuture;
  const q = open ? QUEST_DEFS[open.id] : null;

  const actions: SheetAction[] = [];
  if (q?.kind === 'contest' && open?.slot != null) {
    const slot = open.slot;
    q.options.forEach((o, i) =>
      actions.push({
        label: `수행 — ${optionText(o)}`,
        onClick: () => act({ type: 'doQuest', slot, option: i }),
        disabled: check({ type: 'doQuest', slot, option: i }),
      }),
    );
  }
  const seen = future.slice(0, Math.max(0, sight));

  return (
    <Section
      tone="var(--zone-quest)"
      title={
        <>
          <Icon name="quest" /> 퀘스트 트랙
        </>
      }
      extra={`시야 ${sight} · 미래 ${future.length}장`}
    >
      <div className={styles.row}>
        {game.questSlots.map((id, slot) => (
          <div key={slot} className={styles.slot}>
            <span className={styles.slotLabel}>{slot === 0 ? '칸 1 · 임박' : '칸 2 · 다음'}</span>
            {id ? (
              <div key={id} className="anim-flip">
                <QuestFace q={QUEST_DEFS[id]} width={sizes.card} onClick={() => setOpen({ id, slot })} />
              </div>
            ) : (
              <div className={styles.empty} style={{ width: sizes.card }}>
                비어 있음
              </div>
            )}
          </div>
        ))}
        {/* 미래 더미: 위성 시야만큼 앞면, 나머지는 뒷면 한 더미 — 공개 칸과 같은 줄에 */}
        {seen.map((id, i) =>
          id !== HIDDEN ? (
            <div key={`f${i}`} className={styles.slot}>
              <span className={styles.slotLabel}>미래 {i + 1}</span>
              <QuestFace q={QUEST_DEFS[id]} width={sizes.card} onClick={() => setOpen({ id, slot: null })} />
            </div>
          ) : null,
        )}
        {future.length > seen.length && (
          <div className={styles.slot}>
            <span className={styles.slotLabel}>미래 더미</span>
            <div className={styles.deck} aria-label="미래 퀘스트 더미" data-tip="미래 퀘스트 더미" data-tip-body={`뒷면 ${future.length - seen.length}장. 위성을 띄우면 위에서부터 1장씩 미리 볼 수 있습니다.`}>
              <CardFace frame="quest-back" width={sizes.card} label={`뒷면 퀘스트 ${future.length - seen.length}장`} />
              <span className={styles.deckCount}>{future.length - seen.length}</span>
            </div>
          </div>
        )}
      </div>
      {game.era >= 4 && (
        <p className={styles.note}>종료 묶음: 결실 3장(방주·공생·합성) + 비공개 종료 기록 1장. 결실 퀘스트가 칸 1에 들어오면 그 라운드가 마지막입니다.</p>
      )}
      {q && open && (
        <Sheet title={q.name} onClose={() => setOpen(null)} actions={actions}>
          <CardZoom frame={FRAME[q.kind]} title={q.name} badge={q.kind === 'threat' ? q.power : undefined} art={questArt(q)} body={questSummary(q)} />
          <p className={styles.kind}>
            {QUEST_KIND_NAMES[q.kind]}
            {open.slot === null ? ' · 위성으로 미리 본 카드' : ''}
          </p>
          <p>{questSummary(q)}</p>
          {(q.kind === 'judge' || q.kind === 'contest') && (
            <>
              <p className={styles.kind}>보상 선택지</p>
              <ul className={styles.opts}>
                {q.options.map((o, i) => (
                  <li key={i} style={{ color: `var(--${o.doctrine})` }}>
                    {optionText(o)}
                  </li>
                ))}
              </ul>
              <p className={styles.kind}>지금 조건 {meets(game, game.players[me], q.cond) ? '충족' : '미충족'}</p>
            </>
          )}
          {q.kind === 'fruition' && <p>{DOCTRINE_NAMES[q.doctrine]} 노선의 최종 정산입니다.</p>}
          {q.text && <p className={styles.flavor}>“{q.text}”</p>}
        </Sheet>
      )}
    </Section>
  );
}
