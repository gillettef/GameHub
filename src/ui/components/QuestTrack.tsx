// 퀘스트 트랙(쓰루의 카드 줄 자리): 5칸, 칸 1만 앞면. 칸 2부터는 위성 시야만큼 나에게만 앞면.
// 차례 처음에 1장을 골라 즉시 처리한다(뒷면도 고를 수 있음)
import { useState, type CSSProperties } from 'react';
import type { CardDef, QuestDef } from '../../core/types';
import { QUEST_ROW_SIZE } from '../../core/data/constants';
import { CARD_DEFS } from '../../core/data/cards';
import { QUEST_DEFS } from '../../core/data/quests';
import { meets, playerMods } from '../../core/engine/derive';
import { slotVisible } from '../../core/engine/quest';
import { HIDDEN } from '../../core/mask';
import { useGame } from '../useGame';
import { CARD_FRAME, CARD_ICON, CardFace, type FrameName } from './CardFace';
import { Icon, type IconName } from './Icon';
import { CardZoom } from './CardZoom';
import { CardBrief, QuestBrief } from './CardBrief';
import { useCardSizes } from '../useCardSizes';
import { Section } from './Section';
import { Sheet, type SheetAction } from './Sheet';
import { CARD_TYPE_NAMES, QUEST_KIND_NAMES, cardSegs, cardText, optionSegs, questSegs, questSummary } from '../describe';
import { Segs } from './DoctrineTag';
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
const CARD_TONE: Record<CardDef['type'], string> = { pioneer: 'var(--accent)', legacy: 'var(--ring3)', supply: 'var(--res-prod)', raid: 'var(--danger)', conflict: 'var(--danger)' };
const cardArt = (c: CardDef) => ({ id: c.id, icon: CARD_ICON[c.type], tone: CARD_TONE[c.type] });

export function QuestFace({ q, width, onClick }: { q: QuestDef; width: number; onClick?: () => void }) {
  return (
    <CardFace
      tip={`${QUEST_KIND_NAMES[q.kind]}\n${questSummary(q)}`}
      art={questArt(q)}
      frame={FRAME[q.kind]}
      width={width}
      title={q.name}
      kind={QUEST_KIND_NAMES[q.kind]}
      tagTone={TONE[q.kind]}
      badge={q.kind === 'threat' ? q.power : undefined}
      body={width >= 120 ? questSummary(q) : undefined}
      brief={<QuestBrief q={q} />}
      onClick={onClick}
    />
  );
}

function TrackFace({ id, width, onClick }: { id: string; width: number; onClick: () => void }) {
  const q = QUEST_DEFS[id];
  if (q) return <QuestFace q={q} width={width} onClick={onClick} />;
  const c = CARD_DEFS[id];
  return (
    <CardFace
      frame={CARD_FRAME[c.type]}
      width={width}
      title={c.name}
      kind={CARD_TYPE_NAMES[c.type]}
      tagTone={CARD_TONE[c.type]}
      art={cardArt(c)}
      brief={<CardBrief card={c} />}
      onClick={onClick}
      tip={`${CARD_TYPE_NAMES[c.type]}\n${cardText(c)}`}
      label={`${c.name}, ${CARD_TYPE_NAMES[c.type]}`}
    />
  );
}

export function QuestTrack() {
  const { game, me, myTurn, check, act } = useGame();
  const sizes = useCardSizes();
  const [open, setOpen] = useState<number | null>(null);
  const sight = playerMods(game.players[me]).sight;
  const deck = game.questDecks[game.era];
  const picking = myTurn && game.phase === 'quest' && !game.pending.length;
  // 온라인에서는 가려진 id(HIDDEN)가 오고, 로컬에서는 엔진의 시야 규칙으로 가린다
  const known = (slot: number) => game.questRow[slot] !== HIDDEN && slotVisible(game, me, slot);

  const openId = open !== null ? game.questRow[open] : undefined;
  const openKnown = open !== null && known(open) && openId !== undefined;
  const q = openKnown ? QUEST_DEFS[openId] : null;
  const card = openKnown ? CARD_DEFS[openId] : null;
  const name = q?.name ?? card?.name ?? `칸 ${(open ?? 0) + 1} · 뒷면 카드`;
  const actions: SheetAction[] =
    picking && open !== null
      ? [{ label: openKnown ? '이 카드 고르기' : '모른 채 고르기', onClick: () => act({ type: 'pickQuest', slot: open }), disabled: check({ type: 'pickQuest', slot: open }) }]
      : [];

  return (
    <Section
      id="quest-track"
      tone="var(--zone-quest)"
      title={
        <>
          <Icon name="quest" /> 퀘스트 트랙
        </>
      }
      extra={`시야 ${sight} · 덱 ${deck.length}장 · 밀림 ${game.questDiscard.length}장`}
    >
      {picking && <p className={styles.cue}>차례 처음 — 1장을 골라 바로 처리합니다. 뒷면 카드도 고를 수 있습니다. 차례가 끝나면 칸 1 카드는 밀려 버려집니다.</p>}
      <div className={styles.row}>
        {Array.from({ length: QUEST_ROW_SIZE }, (_, slot) => {
          const id = game.questRow[slot];
          return (
            <div key={slot} className={styles.slot}>
              <span className={styles.slotLabel}>
                칸 {slot + 1}
                {slot === 0 ? ' · 앞면' : id && known(slot) && !game.questOpen[slot] ? ' · 시야' : ''}
              </span>
              {!id ? (
                <div className={styles.empty} style={{ width: sizes.card }}>
                  비어 있음
                </div>
              ) : known(slot) ? (
                // 칸 1의 위협은 붉게 경보하고, 시야로 미리 본 칸(나에게만 보임)은 점선 테두리로 구분한다
                <div key={id} className={`anim-flip ${slot === 0 && QUEST_DEFS[id]?.kind === 'threat' ? 'anim-alarm' : ''} ${slot > 0 && !game.questOpen[slot] ? styles.peek : ''}`} style={{ '--delay': `${slot * 30}ms` } as CSSProperties}>
                  <TrackFace id={id} width={sizes.card} onClick={() => setOpen(slot)} />
                </div>
              ) : (
                <CardFace frame="quest-back" width={sizes.card} label={`칸 ${slot + 1} 뒷면 카드`} tip={`뒷면 카드\n위성을 띄우면 칸 2부터 미리 볼 수 있습니다.`} onClick={() => setOpen(slot)} />
              )}
            </div>
          );
        })}
      </div>
      {game.era >= 4 && (
        <p className={styles.note}>종료 묶음(결실 3장 + 비공개 종료 기록 1장)은 고를 수 없습니다. 종료 묶음 카드가 칸 1에 오면 그 라운드가 마지막입니다.</p>
      )}
      {open !== null && openId !== undefined && (
        <Sheet title={name} onClose={() => setOpen(null)} actions={actions}>
          {q && <CardZoom frame={FRAME[q.kind]} title={q.name} badge={q.kind === 'threat' ? q.power : undefined} art={questArt(q)} body={questSummary(q)} />}
          {card && <CardZoom frame={CARD_FRAME[card.type]} title={card.name} art={cardArt(card)} body={cardText(card)} />}
          {!openKnown && (
            <>
              <CardZoom frame="quest-back" title="뒷면 카드" />
              <p>무엇인지 모른 채 고릅니다. 사건·위협·주둔지 제안·후원자·유산·자원 팟 중 하나입니다. 위성을 띄우면 칸 2부터 시야만큼 미리 볼 수 있습니다.</p>
            </>
          )}
          {q && (
            <>
              <p className={styles.kind}>
                {QUEST_KIND_NAMES[q.kind]}
                {open > 0 && !game.questOpen[open] ? ' · 위성으로 미리 본 카드' : ''}
              </p>
              <p>
                <Segs segs={questSegs(q)} />
              </p>
              {(q.kind === 'judge' || q.kind === 'contest') && (
                <>
                  <p className={styles.kind}>보상 선택지</p>
                  <ul className={styles.opts}>
                    {q.options.map((o, i) => (
                      <li key={i}>
                        <Segs segs={optionSegs(o)} />
                      </li>
                    ))}
                  </ul>
                  <p className={styles.kind}>지금 조건 {meets(game, game.players[me], q.cond) ? '충족' : '미충족'}</p>
                </>
              )}
              {q.kind === 'threat' && <p className={styles.kind}>고르면 카드에 적힌 대상에게 발동합니다(내가 대상이 아닐 수도 있습니다).</p>}
              {(q.kind === 'fruition' || q.kind === 'finale') && <p className={styles.kind}>종료 묶음 카드 — 고를 수 없고, 게임이 끝날 때 정산합니다.</p>}
              {q.text && <p className={styles.flavor}>“{q.text}”</p>}
            </>
          )}
          {card && (
            <>
              <p className={styles.kind}>
                {CARD_TYPE_NAMES[card.type]} · {card.ring}고리
              </p>
              <p>
                <Segs segs={cardSegs(card)} />
              </p>
              {card.type === 'pioneer' && <p className={styles.kind}>고르면 바로 내 후원자가 됩니다(기존 후원자는 버림). 한 시대에 한 명만.</p>}
              {card.type === 'legacy' && <p className={styles.kind}>고르면 “짓는 중”. 단계마다 지휘 1 + 생산. 동시에 하나만.</p>}
              {card.type === 'supply' && <p className={styles.kind}>손에 들고 있다가 다음 차례부터 지휘 1로 사용.</p>}
              {card.type === 'raid' && <p className={styles.kind}>손에 들고 있다가 다음 차례부터 대외 단계에 방위 행동 2와 함께 내서 습격.</p>}
              {card.type === 'conflict' && <p className={styles.kind}>손에 들고 있다가 다음 차례부터(2시대 이후) 대외 단계에 분쟁으로 선포.</p>}
              {card.text && <p className={styles.flavor}>“{card.text}”</p>}
            </>
          )}
        </Sheet>
      )}
    </Section>
  );
}
