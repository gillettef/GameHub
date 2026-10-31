// 식민지 보드: 자원 은행, 행동 토큰, 건물·유닛 칸(정착민 토큰), 선구자·유산·손패·궤도·후원·헌장
import { useState, type ReactNode } from 'react';
import type { BuildingKind, CharterField, PlayerState, UnitKind } from '../../core/types';
import { BUILDING_KINDS, CHARTER_FIELDS, DOCTRINES, RES_KEYS, UNIT_KINDS } from '../../core/types';
import {
  BUILDING_COST,
  BUILDING_NAMES,
  BUILDING_OUTPUT,
  BUILDING_RES,
  CHARTER_COST,
  CHARTER_MODS,
  CHARTER_NAMES,
  COLONIST_FOOD,
  COLONIST_TRACK,
  colonistTrack,
  DOCTRINE_NAMES,
  DOCTRINE_STEP,
  FLYER_ENERGY,
  LEVEL_NAMES,
  RES_NAMES,
  SPORE_CAP,
  UNIT_COST,
  UNIT_NAMES,
  UNIT_POWER,
} from '../../core/data/constants';
import { CARD_DEFS } from '../../core/data/cards';
import { STAGE_TEXT } from '../../core/data/doctrines';
import { PATRON_DEFS } from '../../core/data/patrons';
import { FACILITY_DEFS } from '../../core/data/quests';
import { SATELLITE_DEFS } from '../../core/data/satellites';
import {
  buildingCap,
  buildingCount,
  buildingUnlocked,
  commandMax,
  defenseMax,
  defenseValue,
  mainDoctrine,
  might,
  playerMods,
  productionPreview,
  requiredHealth,
  health,
  stage,
  unitCap,
  unitCount,
  unitUnlocked,
  isHybrid,
  totalColonists,
  unhealthy,
} from '../../core/engine/derive';
import { buildingUpgradeCost, unitUpgradeCost } from '../../core/engine/actions';
import { useGame } from '../useGame';
import { CardFace } from './CardFace';
import { CardArt } from './CardArt';
import { CardZoom } from './CardZoom';
import { CardBrief, ModsBrief } from './CardBrief';
import type { FrameName } from './CardFace';
import { useCardSizes } from '../useCardSizes';
import { Icon, type IconName } from './Icon';
import { Num, useFresh } from '../motion';
import { Section } from './Section';
import { Sheet, type SheetAction } from './Sheet';
import { cardText } from './CardRow';
import { condText, instantText, modsText } from '../describe';
import styles from './ColonyBoard.module.css';

type Open =
  | { k: 'building'; kind: BuildingKind }
  | { k: 'unit'; kind: UnitKind }
  | { k: 'colonist' }
  | { k: 'hand'; index: number }
  | { k: 'legacy' }
  | { k: 'legacyDone'; id: string }
  | { k: 'pioneer' }
  | { k: 'orbit'; index: number }
  | { k: 'charter'; field: CharterField }
  | { k: 'patron'; id: string }
  | { k: 'facility'; id: string }
  | { k: 'doctrine' };

export function ColonyBoard({ player }: { player: PlayerState }) {
  const { game, me, check, act } = useGame();
  const sizes = useCardSizes();
  const [open, setOpen] = useState<Open | null>(null);
  // 새로 들어온 카드는 톡 나타난다
  const fresh = useFresh(700);
  const pop = (key: string) => (fresh(key) ? 'anim-pop' : undefined);
  const p = player;
  const mine = p.id === me;
  const mods = playerMods(p);
  const pv = productionPreview(p, mods);
  const cmdMax = commandMax(game, p, mods);
  const defMax = defenseMax(p, mods);
  const stab = health(p, mods);
  const need = requiredHealth(p);
  const sick = unhealthy(p, mods);
  const total = totalColonists(p);
  const cur = colonistTrack(total);
  const cap = SPORE_CAP + mods.sporeCap;
  const main = mainDoctrine(p);

  const sheet = open ? renderSheet(open) : null;

  type SheetView = { title: ReactNode; body: ReactNode; actions: SheetAction[]; art?: string; artIcon?: IconName; zoom?: { frame: FrameName; text: string; badge?: ReactNode } };
  function renderSheet(o: Open): SheetView {
    const withArt = (r: { title: ReactNode; body: ReactNode; actions: SheetAction[] }, art: string | null | undefined, artIcon: IconName, zoom?: SheetView['zoom']): SheetView => ({ ...r, art: art ?? undefined, artIcon, zoom });
    const acts: SheetAction[] = [];
    const add = (label: string, a: Parameters<typeof check>[0], tone?: SheetAction['tone']) => {
      if (mine) acts.push({ label, onClick: () => act(a), disabled: check(a), tone });
    };
    switch (o.k) {
      case 'building': {
        const k = o.kind;
        const levels = [0, 1, 2, 3].filter((l) => BUILDING_OUTPUT[k][l] != null);
        const top = [...levels].reverse().find((l) => buildingUnlocked(p, k, l));
        for (const l of levels) if (buildingUnlocked(p, k, l)) add(`${LEVEL_NAMES[l]} 건설 — 생산 ${BUILDING_COST[l]} · 지휘 1`, { type: 'build', kind: k, level: l });
        if (top !== undefined)
          for (const l of levels) if (l < top && p.buildings[k][l] > 0) add(`${LEVEL_NAMES[l]} → ${LEVEL_NAMES[top]} 업그레이드 — 생산 ${buildingUpgradeCost(l, top)}`, { type: 'upgrade', kind: k, from: l, to: top });
        for (const l of levels) if (p.buildings[k][l] > 0) add(`${LEVEL_NAMES[l]} 해체 — 지휘 1, 정착민은 유휴로`, { type: 'disband', group: 'building', kind: k, level: l }, 'plain');
        return {
          title: (
            <>
              <Icon name={k} /> {BUILDING_NAMES[k]}
            </>
          ),
          body: (
            <>
              <p>
                {RES_NAMES[BUILDING_RES[k]]} 생산 · 레벨별 {levels.map((l) => `${LEVEL_NAMES[l]} ${BUILDING_OUTPUT[k][l]}`).join(' / ')}
                {k === 'hall' && ' · 회관마다 건강 +1'}
              </p>
              <p className={styles.dim}>
                보유 {buildingCount(p, k)} / 한도 {buildingCap(p, k, mods)} · 해금 최고 레벨 {top !== undefined ? LEVEL_NAMES[top] : '없음'} · 유휴 정착민 {p.idle}
              </p>
            </>
          ),
          actions: acts,
        };
      }
      case 'unit': {
        const k = o.kind;
        const levels = [0, 1, 2, 3].filter((l) => UNIT_POWER[k][l] != null);
        const top = [...levels].reverse().find((l) => unitUnlocked(p, k, l));
        for (const l of levels)
          if (unitUnlocked(p, k, l)) add(`${LEVEL_NAMES[l]} 편성 — 생산 ${UNIT_COST[k][l]}${k === 'flyer' ? ` + 에너지 ${FLYER_ENERGY}` : ''} · 방위 1`, { type: 'buildUnit', kind: k, level: l });
        if (top !== undefined)
          for (const l of levels) if (l < top && p.units[k][l] > 0) add(`${LEVEL_NAMES[l]} → ${LEVEL_NAMES[top]} 업그레이드 — 생산 ${unitUpgradeCost(p, k, l, top)} · 방위 1`, { type: 'upgradeUnit', kind: k, from: l, to: top });
        for (const l of levels) if (p.units[k][l] > 0) add(`${LEVEL_NAMES[l]} 해체 — 지휘 1`, { type: 'disband', group: 'unit', kind: k, level: l }, 'plain');
        const trait: Record<UnitKind, string> = {
          guard: '기본 방위 유닛',
          rider: '습격·분쟁을 걸 때 기동대마다 +1',
          battery: '방어할 때(습격·분쟁 대상, 위협) 포대마다 +1',
          flyer: '내 궤도의 위성 1기마다 비행대 1대당 +1',
        };
        return {
          title: (
            <>
              <Icon name={k} /> {UNIT_NAMES[k]}
            </>
          ),
          body: (
            <>
              <p>
                전력 {levels.map((l) => `${LEVEL_NAMES[l]} ${UNIT_POWER[k][l]}`).join(' / ')} · {trait[k]}
              </p>
              <p className={styles.dim}>
                보유 {unitCount(p, k)} / 한도 {unitCap(p, k, mods)} · 유휴 정착민 {p.idle}
              </p>
            </>
          ),
          actions: acts,
        };
      }
      case 'colonist':
        add(`정착민 늘리기 — 식량 ${COLONIST_FOOD[game.era]} · 지휘 1`, { type: 'addColonist' });
        return {
          title: (
            <>
              <Icon name="colonist" /> 정착민
            </>
          ),
          body: (
            <p>
              유휴 {p.idle} · 공급 {p.pool}. 건물·유닛을 지으면 유휴 정착민이 자동으로 들어갑니다. 생산 단계 식량 소비 {pv.upkeep}. 정착민이 늘면 공급 트랙의 필요 건강도 오릅니다(지금 {need}). 유휴 정착민은 불건강 정착민을 버텨 줍니다.
              {sick > 0 && (
                <>
                  <br />
                  <strong className={pv.plague ? styles.danger : styles.warn}>
                    불건강 {sick}명 · 유휴 {p.idle}명 — {pv.plague ? '다음 생산 단계에 역병으로 건물 생산이 모두 멈춥니다.' : '유휴 정착민이 버티고 있어 아직 괜찮습니다.'}
                  </strong>
                  {pv.plague && ` 해결: 건강 +${sick - p.idle} 올리기(회관 건설 등), 에너지를 써서 포자 안개 줄이기, 또는 건물·유닛을 해체해 유휴 정착민 늘리기.`}
                </>
              )}
            </p>
          ),
          actions: acts,
        };
      case 'hand': {
        const h = p.hand[o.index];
        const c = h && CARD_DEFS[h.id];
        if (!c || c.type !== 'supply') return { title: '보급', body: null, actions: [] };
        add('사용 — 지휘 1', { type: 'useSupply', index: o.index });
        return withArt({ title: c.name, body: <p>{instantText(c.instant)}{h.fresh ? ' · 이번 차례에 가져와서 아직 쓸 수 없음' : ''}</p>, actions: acts }, c.id, 'supply', { frame: 'supply', text: instantText(c.instant) });
      }
      case 'legacy': {
        const wip = p.legacyWip;
        const c = wip && CARD_DEFS[wip.id];
        if (!wip || !c || c.type !== 'legacy') return { title: '유산', body: null, actions: [] };
        add(`${wip.done + 1}단계 짓기 — 생산 ${c.stages[wip.done]} · 지휘 1`, { type: 'legacyStage' });
        return withArt({ title: `${c.name} (짓는 중 ${wip.done}/${c.stages.length})`, body: <p>{cardText(c)}</p>, actions: acts }, c.id, 'legacy', { frame: 'legacy', text: cardText(c), badge: `${wip.done}` });
      }
      case 'legacyDone': {
        const c = CARD_DEFS[o.id];
        return withArt({ title: `${c.name} (완성)`, body: <p>{cardText(c)}</p>, actions: [] }, c.id, 'legacy', { frame: 'legacy', text: cardText(c), badge: '✓' });
      }
      case 'pioneer': {
        const c = p.pioneer ? CARD_DEFS[p.pioneer] : null;
        return withArt({ title: c?.name ?? '선구자', body: <p>{c ? cardText(c) : ''}</p>, actions: [] }, p.pioneer, 'pioneer', c ? { frame: 'pioneer', text: cardText(c) } : undefined);
      }
      case 'orbit': {
        const ob = p.orbit[o.index];
        const s = ob && SATELLITE_DEFS[ob.id];
        return withArt({ title: s?.name ?? '위성', body: <p>남은 {ob?.timer}차례 · 시야 +1{s && modsText(s.mods) ? ` · ${modsText(s.mods)}` : ''}</p>, actions: [] }, s?.id, 'satellite', s ? { frame: 'satellite', text: `남은 ${ob?.timer}차례 · 시야 +1${modsText(s.mods) ? ` · ${modsText(s.mods)}` : ''}`, badge: ob?.timer } : undefined);
      }
      case 'charter': {
        const f = o.field;
        const next = p.charters[f] + 1;
        if (next <= 3) add(`${next}단계 구매 — 문화 ${CHARTER_COST[next]} · 지휘 1`, { type: 'charter', field: f });
        return {
          title: `헌장 · ${CHARTER_NAMES[f]}`,
          body: (
            <ul className={styles.list}>
              {[1, 2, 3].map((l) => (
                <li key={l} className={p.charters[f] >= l ? styles.got : ''}>
                  {l}단계(문화 {CHARTER_COST[l]}): {l === 3 && f === 'explore' ? '다음 고리 줄기까지 연구 가능' : modsText(CHARTER_MODS[f][l])}
                </li>
              ))}
              <li>3단계까지 채우면 최종 점수 +4</li>
            </ul>
          ),
          actions: acts,
        };
      }
      case 'patron': {
        const d = PATRON_DEFS[o.id];
        return withArt({ title: d.name, body: <p>{modsText(d.mods)} · 본국 요구: {condText([d.demand])} (시대 전환 때 검사) · {d.points}점</p>, actions: [] }, d.id, 'patron', { frame: 'patron', text: `${modsText(d.mods)} · 요구: ${condText([d.demand])}`, badge: d.points });
      }
      case 'facility': {
        const f = FACILITY_DEFS[o.id];
        return withArt({ title: f.name, body: <p>{modsText(f.mods)}</p>, actions: [] }, f.id, 'workshop');
      }
      case 'doctrine':
        return {
          title: '노선',
          body: (
            <>
              {DOCTRINES.map((d) => (
                <div key={d} style={{ color: `var(--${d})` }}>
                  <strong>
                    {DOCTRINE_NAMES[d]} {p.doctrine[d]}점 · 단계 {stage(p, d)}
                  </strong>
                  <ul className={styles.list}>
                    {[1, 2, 3, 4].map((s) => (
                      <li key={s} className={stage(p, d) >= s ? styles.got : ''}>
                        {s * DOCTRINE_STEP}점: {STAGE_TEXT[d][s]}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className={styles.dim}>상성: 방주 → 합성 → 공생 → 방주(습격·분쟁 판정 ±2). 두 노선이 단계 2 이상이면 혼합 노선 — 상성 영향 없음.</p>
            </>
          ),
          actions: [],
        };
    }
  }

  const resIcons: Record<string, IconName> = { food: 'food', prod: 'prod', energy: 'energy', sci: 'sci', culture: 'culture' };

  return (
    <Section
      tone={`var(--seat-${p.id})`}
      title={
        <>
          <Icon name="colonist" /> {mine ? '내 식민지' : `${p.name}의 식민지`}
        </>
      }
      extra={main ? `주 노선 ${DOCTRINE_NAMES[main]}${isHybrid(p) ? ' · 혼합' : ''}` : isHybrid(p) ? '혼합 노선' : '주 노선 없음'}
    >
      {/* 자원 은행 */}
      <div className={styles.bank}>
        {RES_KEYS.map((k) => {
          const net = k === 'food' ? pv.net.food : pv.gross[k];
          return (
            <div key={k} className={styles.res} style={{ color: `var(--res-${k})` }} aria-label={`${RES_NAMES[k]} ${p.res[k]}, 생산 ${net}`} data-tip={RES_NAMES[k]} data-tip-body={`보유 ${p.res[k]} · 생산 단계마다 ${net >= 0 ? '+' : ''}${net}${k === 'food' ? `(소비 ${pv.upkeep} 반영)` : ''}${k === 'culture' ? '\n문화가 곧 점수입니다.' : ''}`}>
              <Icon name={resIcons[k]} size={18} />
              <strong>
                <Num value={p.res[k]} />
              </strong>
              <span className={styles.net}>{net >= 0 ? `+${net}` : net}</span>
            </div>
          );
        })}
      </div>

      {/* 행동 토큰과 상태 */}
      <div className={styles.tokens}>
        <span className={styles.tokenGroup} aria-label={`지휘 ${cmdMax - p.commandUsed}/${cmdMax}`} data-tip={`지휘 행동 ${cmdMax - p.commandUsed}/${cmdMax}`} data-tip-body="연구·카드 가져오기·건설·정착민·유산·위성·헌장·경쟁 퀘스트에 씁니다.">
          <Icon name="command" size={16} />
          {Array.from({ length: cmdMax }, (_, i) => (
            <span key={i} className={`${styles.cmd} ${i < p.commandUsed ? styles.used : ''}`} />
          ))}
        </span>
        <span className={styles.tokenGroup} aria-label={`방위 ${defMax - p.defenseUsed}/${defMax}`} data-tip={`방위 행동 ${defMax - p.defenseUsed}/${defMax}`} data-tip-body="유닛 편성·업그레이드, 습격(2)·분쟁 판정(3)·트랙 당기기(1). 남기면 방위 태세(최대 +2).">
          <Icon name="defense" size={16} color="var(--danger)" />
          {Array.from({ length: defMax }, (_, i) => (
            <span key={i} className={`${styles.def} ${i < p.defenseUsed ? styles.used : ''}`} />
          ))}
        </span>
      </div>
      <div className={styles.status}>
        <span className={stab < need ? styles.warn : ''} data-tip="건강" data-tip-body={`현재 ${stab} / 필요 ${need}(정착민 공급 트랙). 모자란 만큼 불건강 정착민이 생기고, 유휴 정착민보다 많으면 역병으로 건물 생산이 멈춥니다. 회관마다 +1.`}>
          <Icon name="health" size={14} /> 건강 {stab}/{need}
        </span>
        <span data-tip="방위력" data-tip-body={`유닛 전력 합 + 보너스. 방어할 때는 포대마다 +1(방어값 ${defenseValue(p)}). 위협·습격·분쟁 판정에 씁니다.`}>
          <Icon name="might" size={14} /> 방위력 {might(p, mods)} (방어 {defenseValue(p)})
        </span>
        <span className={p.res.energy > cap ? styles.warn : ''} data-tip="포자 안개" data-tip-body={`보유 에너지 ${p.res.energy} / 기준 ${cap}. 기준을 넘으면 초과 3마다 건강 −1.`}>
          <Icon name="spore" size={14} /> 포자 {p.res.energy}/{cap}
        </span>
        <span data-tip="시야" data-tip-body="미래 퀘스트 더미를 위에서부터 볼 수 있는 장수. 궤도의 위성 1기마다 +1.">
          <Icon name="satellite" size={14} /> 시야 {mods.sight}
        </span>
        {p.guard > 0 && <span>방위 태세 +{p.guard}</span>}
        {sick > 0 && (
          // 터치 기기는 툴팁이 없으니 눌러서 정착민 시트(해결법 포함)를 연다
          <button className={`${styles.alert} ${pv.plague ? styles.danger : styles.warn}`} onClick={() => setOpen({ k: 'colonist' })}>
            {pv.plague && <Icon name="threat" size={14} />}
            {pv.plague ? `역병 예정 — 불건강 ${sick} > 유휴 ${p.idle}` : `불건강 ${sick} ≤ 유휴 ${p.idle}`}
          </button>
        )}
      </div>

      {/* 노선 트랙 */}
      <button className={styles.doctrines} onClick={() => setOpen({ k: 'doctrine' })} aria-label="노선 상세" data-tip="노선" data-tip-body={DOCTRINES.map((d) => `${DOCTRINE_NAMES[d]} ${p.doctrine[d]}점 · 단계 ${stage(p, d)}`).join('\n')}>
        {DOCTRINES.map((d) => (
          <span key={d} className={styles.track} style={{ color: `var(--${d})` }}>
            <Icon name={d} size={14} />
            <span className={styles.bar}>
              <span style={{ width: `${Math.min(100, (p.doctrine[d] / (DOCTRINE_STEP * 4)) * 100)}%` }} />
              {[1, 2, 3].map((s) => (
                <i key={s} style={{ left: `${s * 25}%` }} />
              ))}
            </span>
            <b>{p.doctrine[d]}</b>
          </span>
        ))}
      </button>

      {/* 건물 칸 */}
      <div className={styles.tableau}>
        {BUILDING_KINDS.map((k) => (
          <Column
            key={k}
            icon={k}
            name={BUILDING_NAMES[k]}
            count={buildingCount(p, k)}
            cap={buildingCap(p, k, mods)}
            levels={[3, 2, 1, 0].filter((l) => BUILDING_OUTPUT[k][l] != null)}
            have={p.buildings[k]}
            unlocked={(l) => buildingUnlocked(p, k, l)}
            color={`var(--res-${BUILDING_RES[k]})`}
            onClick={() => setOpen({ k: 'building', kind: k })}
          />
        ))}
      </div>
      <div className={`${styles.tableau} ${styles.units}`}>
        {UNIT_KINDS.map((k) => (
          <Column
            key={k}
            icon={k}
            name={UNIT_NAMES[k]}
            count={unitCount(p, k)}
            cap={unitCap(p, k, mods)}
            levels={[3, 2, 1, 0].filter((l) => UNIT_POWER[k][l] != null)}
            have={p.units[k]}
            unlocked={(l) => unitUnlocked(p, k, l)}
            color="var(--danger)"
            onClick={() => setOpen({ k: 'unit', kind: k })}
          />
        ))}
      </div>

      {/* 정착민 */}
      <button className={styles.colonists} onClick={() => setOpen({ k: 'colonist' })}>
        <span>유휴</span>
        {Array.from({ length: p.idle }, (_, i) => (
          <span key={i} className={styles.pawn} />
        ))}
        {p.idle === 0 && <span className={styles.dim}>없음</span>}
        <span className={styles.pool}>공급 {p.pool}</span>
      </button>
      {/* 정착민 공급 트랙: 구간마다 인쇄된 식량 소비·필요 건강, 지금 구간 강조 */}
      <ol className={styles.supply} aria-label={`정착민 공급 트랙 — 총 ${total}명, 식량 소비 ${pv.upkeep}, 필요 건강 ${need}`}>
        {COLONIST_TRACK.map((s, i) => {
          const from = i === 0 ? 1 : COLONIST_TRACK[i - 1].upTo + 1;
          const range = from === s.upTo ? `${s.upTo}` : `${from}–${s.upTo}`;
          const here = s === cur;
          return (
            <li
              key={s.upTo}
              className={`${styles.seg} ${here ? styles.segOn : ''} ${total > s.upTo ? styles.segPast : ''}`}
              aria-current={here ? 'step' : undefined}
              aria-label={`${range}명: 식량 −${s.food}, 필요 건강 ${s.health}${here ? ', 현재' : ''}`}
            >
              <span className={styles.segRange} aria-hidden>
                {here && '▶'}
                {range}
              </span>
              <span className={styles.segFood} aria-hidden>
                <Icon name="food" size={12} />−{s.food}
              </span>
              <span className={styles.segHealth} aria-hidden>
                <Icon name="health" size={12} />
                {s.health}
              </span>
            </li>
          );
        })}
      </ol>

      {/* 카드 영역 */}
      <div className={styles.cards}>
        <Slot label="선구자">
          {p.pioneer ? (
            <CardFace className={pop(`pio:${p.pioneer}`)} frame="pioneer" width={sizes.card} title={CARD_DEFS[p.pioneer].name} tip={`선구자\n${cardText(CARD_DEFS[p.pioneer])}`} art={{ id: p.pioneer, icon: 'pioneer' }} brief={<CardBrief card={CARD_DEFS[p.pioneer]} />} onClick={() => setOpen({ k: 'pioneer' })} />
          ) : (
            <Empty />
          )}
        </Slot>
        <Slot label={`유산 ${p.legacies.length}`}>
          {p.legacyWip ? (
            <CardFace className={pop(`wip:${p.legacyWip.id}`)} frame="legacy" width={sizes.card} title={CARD_DEFS[p.legacyWip.id].name} tip={`유산 짓는 중 ${p.legacyWip.done}단계\n${cardText(CARD_DEFS[p.legacyWip.id])}`} badge={`${p.legacyWip.done}`} art={{ id: p.legacyWip.id, icon: 'legacy' }} brief={<CardBrief card={CARD_DEFS[p.legacyWip.id]} />} onClick={() => setOpen({ k: 'legacy' })} />
          ) : (
            <Empty />
          )}
          {p.legacies.map((id) => (
            <CardFace key={id} className={pop(`done:${id}`)} frame="legacy" width={sizes.card} title={CARD_DEFS[id].name} tip={`완성한 유산\n${cardText(CARD_DEFS[id])}`} badge="✓" art={{ id, icon: 'legacy' }} onClick={() => setOpen({ k: 'legacyDone', id })} brief={<CardBrief card={CARD_DEFS[id]} />} />
          ))}
        </Slot>
        <Slot label={`보급 ${p.hand.length}`}>
          {p.hand.length === 0 && <Empty />}
          {p.hand.map((h, i) => (
            <CardFace key={i} className={pop(`hand:${h.id}:${p.hand.slice(0, i).filter((x) => x.id === h.id).length}`)} frame="supply" width={sizes.card} title={CARD_DEFS[h.id].name} tip={`보급${h.fresh ? ' · 다음 차례부터 사용' : ''}\n${cardText(CARD_DEFS[h.id])}`} dim={h.fresh} art={{ id: h.id, icon: 'supply' }} brief={<CardBrief card={CARD_DEFS[h.id]} />} onClick={() => setOpen({ k: 'hand', index: i })} />
          ))}
        </Slot>
        <Slot label="궤도">
          {p.orbit.length === 0 && <Empty />}
          {p.orbit.map((o, i) => (
            <CardFace key={i} className={pop(`orb:${o.id}`)} frame="satellite" width={sizes.card} title={SATELLITE_DEFS[o.id].name} tip={`위성 · 남은 ${o.timer}차례\n시야 +1${modsText(SATELLITE_DEFS[o.id].mods) ? ` · ${modsText(SATELLITE_DEFS[o.id].mods)}` : ''}`} badge={o.timer} art={{ id: o.id, icon: 'satellite' }} brief={<ModsBrief mods={SATELLITE_DEFS[o.id].mods} />} onClick={() => setOpen({ k: 'orbit', index: i })} />
          ))}
        </Slot>
        {(p.patrons.length > 0 || mine) && (
          <Slot label="후원 계약">
            {p.patrons.length === 0 && <Empty />}
            {p.patrons.map((id) => (
              <CardFace key={id} className={pop(`pat:${id}`)} frame="patron" width={sizes.card} title={PATRON_DEFS[id].name} tip={`후원 계약 · ${PATRON_DEFS[id].points}점\n${modsText(PATRON_DEFS[id].mods)}\n요구: ${condText([PATRON_DEFS[id].demand])}`} badge={PATRON_DEFS[id].points} art={{ id, icon: 'patron' }} brief={<ModsBrief mods={PATRON_DEFS[id].mods} />} onClick={() => setOpen({ k: 'patron', id })} />
            ))}
          </Slot>
        )}
        {p.facilities.length > 0 && (
          <Slot label="특수 시설">
            {p.facilities.map((id) => (
              <button key={id} className={styles.artTile} style={{ width: sizes.card }} onClick={() => setOpen({ k: 'facility', id })}>
                <CardArt id={id} icon="workshop" tone="var(--warn)" />
                <span>{FACILITY_DEFS[id].name}</span>
              </button>
            ))}
          </Slot>
        )}
      </div>

      {/* 헌장 */}
      <div className={styles.charters}>
        {CHARTER_FIELDS.map((f) => (
          <button key={f} className={styles.charter} onClick={() => setOpen({ k: 'charter', field: f })} data-tip={`헌장 · ${CHARTER_NAMES[f]} ${p.charters[f]}/3`} data-tip-body={p.charters[f] < 3 ? `다음 단계(문화 ${CHARTER_COST[p.charters[f] + 1]}): ${f === 'explore' && p.charters[f] === 2 ? '다음 고리 줄기까지 연구 가능' : modsText(CHARTER_MODS[f][p.charters[f] + 1])}` : '모두 채움 — 최종 점수 +4'}>
            <Icon name="charter" size={14} />
            {CHARTER_NAMES[f]}
            <span className={styles.pips}>
              {[1, 2, 3].map((l) => (
                <i key={l} className={p.charters[f] >= l ? styles.pipOn : ''} />
              ))}
            </span>
          </button>
        ))}
      </div>

      {sheet && (
        <Sheet title={sheet.title} onClose={() => setOpen(null)} actions={sheet.actions}>
          {sheet.art && sheet.zoom && (
            <CardZoom frame={sheet.zoom.frame} title={typeof sheet.title === 'string' ? sheet.title.replace(/ \((짓는 중|완성).*$/, '') : undefined} badge={sheet.zoom.badge} art={{ id: sheet.art, icon: sheet.artIcon }} body={sheet.zoom.text} />
          )}
          {sheet.art && !sheet.zoom && <CardArt id={sheet.art} icon={sheet.artIcon} className={styles.banner} />}
          {sheet.body}
        </Sheet>
      )}
    </Section>
  );
}

function Column({
  icon,
  name,
  count,
  cap,
  levels,
  have,
  unlocked,
  color,
  onClick,
}: {
  icon: IconName;
  name: string;
  count: number;
  cap: number;
  levels: number[];
  have: number[];
  unlocked: (l: number) => boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button className={styles.col} onClick={onClick} aria-label={`${name} ${count}/${cap}`} data-tip={`${name} ${count}/${cap}`} data-tip-body={levels.map((l) => `${l === 0 ? '기초' : `Lv${l}`} ${have[l]}개${unlocked(l) ? '' : ' (잠김)'}`).join(' · ')}>
      <span className={styles.colHead} style={{ color }}>
        <Icon name={icon} size={18} />
        <span>{name}</span>
        <small>
          {count}/{cap}
        </small>
      </span>
      {levels.map((l) => (
        <span key={l} className={`${styles.cell} ${unlocked(l) ? '' : styles.locked}`}>
          <span className={styles.lvl}>{l === 0 ? '기' : l}</span>
          <span className={styles.pawns}>
            {Array.from({ length: have[l] }, (_, i) => (
              <span key={i} className={styles.pawn} />
            ))}
          </span>
        </span>
      ))}
    </button>
  );
}

function Slot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.slot}>
      <span className={styles.slotLabel}>{label}</span>
      <div className={styles.slotCards}>{children}</div>
    </div>
  );
}

function Empty() {
  const { card } = useCardSizes();
  return (
    <span className={styles.emptyCard} style={{ width: card }}>
      없음
    </span>
  );
}
