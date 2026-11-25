// 공용 영역(BGA TTA 의 공용 전술칸 자리): 위성 시장과 공용 덱 현황
import { useState } from 'react';
import { SATELLITE_DEFS } from '../../engine/data/satellites';
import { useGame } from '../useGame';
import { CardArt } from './CardArt';
import { CardZoom } from './CardZoom';
import { Icon } from './Icon';
import { Section } from './Section';
import { Sheet, type SheetAction } from './Sheet';
import { modsText } from '../describe';
import styles from './CommonArea.module.css';

export function CommonArea() {
  const { game, me, check, act } = useGame();
  const [slot, setSlot] = useState<number | null>(null);
  const p = game.players[me];
  const id = slot !== null ? game.satMarket[slot] : null;
  const s = id ? SATELLITE_DEFS[id] : null;

  const actions: SheetAction[] = [];
  if (s && slot !== null) {
    if (p.orbit.length < 2) actions.push({ label: `발사 — 에너지 ${s.cost} · 지휘 1`, onClick: () => act({ type: 'launch', slot }), disabled: check({ type: 'launch', slot }) });
    else
      p.orbit.forEach((ob, i) =>
        actions.push({
          label: `발사 — 「${SATELLITE_DEFS[ob.id].name}」 대신 · 에너지 ${s.cost}`,
          onClick: () => act({ type: 'launch', slot, replace: i }),
          disabled: check({ type: 'launch', slot, replace: i }),
        }),
      );
  }
  const text = s ? `궤도 ${s.timer}차례 · 시야 +1${modsText(s.mods) ? ` · ${modsText(s.mods)}` : ''}` : '';

  return (
    <Section
      id="common-area"
      tone="var(--zone-common)"
      title={
        <>
          <Icon name="satellite" /> 공용 영역
        </>
      }
      extra={`위성 덱 ${game.satDeck.length}`}
    >
      <span className={styles.label}>위성 시장 — 지휘 1 + 에너지로 발사</span>
      <div className={styles.market}>
        {game.satMarket.map((sid, i) =>
          sid ? (
            <button key={i} className={styles.tile} onClick={() => setSlot(i)} data-tip={SATELLITE_DEFS[sid].name} data-tip-body={`에너지 ${SATELLITE_DEFS[sid].cost} · 궤도 ${SATELLITE_DEFS[sid].timer}차례\n시야 +1${modsText(SATELLITE_DEFS[sid].mods) ? ` · ${modsText(SATELLITE_DEFS[sid].mods)}` : ''}`}>
              <CardArt id={sid} icon="satellite" tone="var(--ark)" />
              <span>
                {SATELLITE_DEFS[sid].name} <b className={styles.cost} aria-label={`에너지 ${SATELLITE_DEFS[sid].cost}`}>
                  <Icon name="energy" size={13} />
                  {SATELLITE_DEFS[sid].cost}
                </b>
              </span>
            </button>
          ) : (
            <span key={i} className={styles.empty}>
              빈칸
            </span>
          ),
        )}
      </div>

      {s && (
        <Sheet title={s.name} onClose={() => setSlot(null)} actions={actions}>
          <CardZoom frame="satellite" title={s.name} badge={s.cost} art={{ id: s.id, icon: 'satellite' }} body={text} />
          <p>{text}</p>
        </Sheet>
      )}
    </Section>
  );
}
