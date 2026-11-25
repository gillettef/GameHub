// 식민지 보드: 착륙지 풍경(구조물·유닛·정착민 말·유산 기념물), 자원 토큰·행동 구슬, 상태·노선·공급 트랙, 후원자·유산·손패·궤도·후원·헌장
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { BuildingKind, CharterField, PlayerState, UnitKind } from '../../engine/types';
import { CHARTER_FIELDS, DOCTRINES, RES_KEYS } from '../../engine/types';
import {
  BUILDING_COST,
  BUILDING_NAMES,
  BUILDING_OUTPUT,
  BUILDING_RES,
  CHARTER_COST,
  CHARTER_FULL_POINTS,
  CHARTER_MODS,
  CHARTER_NAMES,
  COLONIST_FOOD,
  FEAST_CULTURE,
  FEAST_FOOD,
  FEAST_MIN_FOOD,
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
} from '../../engine/data/constants';
import { CARD_DEFS } from '../../engine/data/cards';
import { STAGE_TEXT } from '../../engine/data/doctrines';
import { PATRON_DEFS } from '../../engine/data/patrons';
import { FACILITY_DEFS } from '../../engine/data/quests';
import { SATELLITE_DEFS } from '../../engine/data/satellites';
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
  unitPoolCap,
  unitTotal,
  unitCount,
  unitUnlocked,
  isHybrid,
  totalColonists,
  unhealthy,
} from '../../engine/rules/derive';
import { buildingUpgradeCost, feastBundles, unitUpgradeCost } from '../../engine/rules/actions';
import { useGame } from '../useGame';
import { CARD_FRAME, CARD_ICON, CardFace } from './CardFace';
import { CardArt } from './CardArt';
import { CardZoom } from './CardZoom';
import { CardBrief, ModsBrief } from './CardBrief';
import type { FrameName } from './CardFace';
import { useCardSizes } from '../useCardSizes';
import { Icon, type IconName } from './Icon';
import { useFresh } from '../motion';
import { Section } from './Section';
import { ActionBeads, ColonyScene, Prop, ResourceTray } from './ColonyScene';
import yardArt from '../assets/scene/yard.webp';
import arkEmblem from '../assets/emblems/ark.svg';
import symbiontEmblem from '../assets/emblems/symbiont.svg';
import synthEmblem from '../assets/emblems/synth.svg';
import { Sheet, type SheetAction } from './Sheet';
import { CARD_TYPE_NAMES, cardSegs, cardText, condText, instantSegs, instantText, modsText } from '../describe';
import { DoctrineTag, Segs } from './DoctrineTag';
import styles from './ColonyBoard.module.css';

type Vars = CSSProperties & Record<`--${string}`, string | number>;
const EMBLEMS: Record<(typeof DOCTRINES)[number], string> = { ark: arkEmblem, symbiont: symbiontEmblem, synth: synthEmblem };

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
  | { k: 'doctrine' }
  | { k: 'info'; title: string; body: string };

/** 행동 뒤에도 갱신된 상태로 시트를 열어 두는(이어서 반복할 수 있는) 행동 */
const REPEATABLE = new Set(['build', 'upgrade', 'buildUnit', 'upgradeUnit', 'addColonist', 'feast', 'legacyStage', 'charter']);

export function ColonyBoard({ player }: { player: PlayerState }) {
  const { game, me, watching, check, act } = useGame();
  const sizes = useCardSizes();
  const [open, setOpen] = useState<Open | null>(null);
  // 새로 들어온 카드는 톡 나타난다
  const fresh = useFresh(700);
  const pop = (key: string) => (fresh(key) ? 'anim-pop' : undefined);
  const p = player;
  const mine = p.id === me && !watching;
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

  // 유산 마지막 단계를 지으면(짓는 중 카드가 사라짐) 열어 둔 시트를 방금 완성한 유산 보기로 바꾼다
  const view: Open | null =
    open?.k === 'legacy' && !p.legacyWip ? (p.legacies.length ? { k: 'legacyDone', id: p.legacies[p.legacies.length - 1] } : null) : open;
  const sheet = view ? renderSheet(view) : null;

  type SheetView = { title: ReactNode; body: ReactNode; actions: SheetAction[]; art?: string; artIcon?: IconName; zoom?: { frame: FrameName; text: string; badge?: ReactNode } };
  function renderSheet(o: Open): SheetView {
    const withArt = (r: { title: ReactNode; body: ReactNode; actions: SheetAction[] }, art: string | null | undefined, artIcon: IconName, zoom?: SheetView['zoom']): SheetView => ({ ...r, art: art ?? undefined, artIcon, zoom });
    const acts: SheetAction[] = [];
    const add = (label: string, a: Parameters<typeof check>[0], tone?: SheetAction['tone']) => {
      if (mine) acts.push({ label, onClick: () => act(a), disabled: check(a), tone, keepOpen: REPEATABLE.has(a.type) });
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
                보유 {unitCount(p, k)} · 유닛 전체 {unitTotal(p)} / {unitPoolCap(p, mods)} · 유휴 정착민 {p.idle}
              </p>
            </>
          ),
          actions: acts,
        };
      }
      case 'colonist':
        add(`정착민 늘리기 — 식량 ${COLONIST_FOOD[game.era]} · 지휘 1`, { type: 'addColonist' });
        {
          const n = feastBundles(p.res.food);
          add(n > 0 ? `개척 만찬 — 식량 −${n * FEAST_FOOD} → 문화 +${n * FEAST_CULTURE} (차례당 1회, 지휘 없음)` : `개척 만찬 — 식량 ${FEAST_MIN_FOOD} 이상일 때 (차례당 1회, 지휘 없음)`, { type: 'feast' });
        }
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
        if (!c) return { title: '손패', body: null, actions: [] };
        if (c.type === 'raid' || c.type === 'conflict')
          return withArt({ title: c.name, body: <p><Segs segs={cardSegs(c)} />{h.fresh ? ' · 이번 차례에 가져와서 아직 쓸 수 없음' : ' · 대외 단계에 상단의 ' + (c.type === 'raid' ? '습격' : '분쟁') + ' 버튼으로 씁니다'}</p>, actions: [] }, c.id, CARD_ICON[c.type], { frame: CARD_FRAME[c.type], text: cardText(c) });
        if (c.type !== 'supply') return { title: '손패', body: null, actions: [] };
        add('사용 — 지휘 1', { type: 'useSupply', index: o.index });
        return withArt({ title: c.name, body: <p><Segs segs={instantSegs(c.instant)} />{h.fresh ? ' · 이번 차례에 가져와서 아직 쓸 수 없음' : ''}</p>, actions: acts }, c.id, 'supply', { frame: 'supply', text: instantText(c.instant) });
      }
      case 'legacy': {
        const wip = p.legacyWip;
        const c = wip && CARD_DEFS[wip.id];
        if (!wip || !c || c.type !== 'legacy') return { title: '유산', body: null, actions: [] };
        add(`${wip.done + 1}단계 짓기 — 생산 ${c.stages[wip.done]} · 지휘 1`, { type: 'legacyStage' });
        return withArt({ title: `${c.name} (짓는 중 ${wip.done}/${c.stages.length})`, body: <p><Segs segs={cardSegs(c)} /></p>, actions: acts }, c.id, 'legacy', { frame: 'legacy', text: cardText(c), badge: `${wip.done}` });
      }
      case 'legacyDone': {
        const c = CARD_DEFS[o.id];
        return withArt({ title: `${c.name} (완성)`, body: <p><Segs segs={cardSegs(c)} /></p>, actions: [] }, c.id, 'legacy', { frame: 'legacy', text: cardText(c), badge: '✓' });
      }
      case 'pioneer': {
        const c = p.pioneer ? CARD_DEFS[p.pioneer] : null;
        return withArt({ title: c?.name ?? '후원자', body: <p>{c ? <Segs segs={cardSegs(c)} /> : ''}</p>, actions: [] }, p.pioneer, 'pioneer', c ? { frame: 'pioneer', text: cardText(c) } : undefined);
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
              <li>3단계까지 채우면 최종 점수 +{CHARTER_FULL_POINTS}</li>
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
      case 'info':
        return { title: o.title, body: <p className={styles.preline}>{o.body}</p>, actions: [] };
      case 'doctrine':
        return {
          title: '노선',
          body: (
            <>
              {DOCTRINES.map((d) => (
                <div key={d} style={{ color: `var(--${d})` }}>
                  <strong>
                    <DoctrineTag doctrine={d} /> {p.doctrine[d]}점 · 단계 {stage(p, d)}
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

  const net = Object.fromEntries(RES_KEYS.map((k) => [k, k === 'food' ? pv.net.food : pv.gross[k]])) as Record<(typeof RES_KEYS)[number], number>;

  return (
    <Section
      tone={`var(--seat-${p.id})`}
      title={
        <>
          <Icon name="colonist" /> {mine ? '내 식민지' : `${p.name}의 식민지`}
        </>
      }
      extra={
        main ? (
          <>
            주 노선 <DoctrineTag doctrine={main} />
            {isHybrid(p) ? ' · 혼합' : ''}
          </>
        ) : isHybrid(p) ? (
          '혼합 노선'
        ) : (
          '주 노선 없음'
        )
      }
    >
      {/* 착륙지 풍경: 구조물·유닛·정착민·유산이 그림으로 선다. 누르면 같은 시트 */}
      <ColonyScene
        player={p}
        era={game.era}
        mods={mods}
        eager={mine}
        net={net}
        upkeep={pv.upkeep}
        onBuilding={(kind) => setOpen({ k: 'building', kind })}
        onUnit={(kind) => setOpen({ k: 'unit', kind })}
        onColonist={() => setOpen({ k: 'colonist' })}
        onLegacy={() => setOpen({ k: 'legacy' })}
        onLegacyDone={(id) => setOpen({ k: 'legacyDone', id })}
      />
      {/* 풍경 아래 앞마당: 그림 바탕 위에 토큰 접시·구슬 받침·메달·트랙·카드 자리·헌장 깃발 */}
      <div className={styles.yard} style={{ '--yard': `url("${yardArt}")` } as Vars}>
        <ResourceTray res={p.res} net={net} upkeep={pv.upkeep} />
        <ActionBeads cmdMax={cmdMax} cmdUsed={p.commandUsed} defMax={defMax} defUsed={p.defenseUsed} />

        {/* 상태 메달 */}
        <div className={styles.status}>
          <Medal
            onOpen={(title, body) => setOpen({ k: 'info', title, body })}
            icon="health"
            tone="var(--eff-health)"
            label="건강"
            value={`${stab}/${need}`}
            warn={stab < need}
            tip="건강"
            tipBody={`현재 ${stab} / 필요 ${need}(정착민 공급 트랙). 모자란 만큼 불건강 정착민이 생기고, 유휴 정착민보다 많으면 역병으로 건물 생산이 멈춥니다. 회관마다 +1.`}
          />
          <Medal
            onOpen={(title, body) => setOpen({ k: 'info', title, body })}
            icon="might"
            say={`${might(p, mods)}, 방어 ${defenseValue(p)}`}
            tone="var(--danger)"
            label="방위력"
            value={
              <>
                {might(p, mods)}
                <small> 방어 {defenseValue(p)}</small>
              </>
            }
            tip="방위력"
            tipBody={`유닛 전력 합 + 보너스. 방어할 때는 포대마다 +1(방어값 ${defenseValue(p)}). 위협·습격·분쟁 판정에 씁니다.`}
          />
          <Medal
            onOpen={(title, body) => setOpen({ k: 'info', title, body })}
            icon="spore"
            tone="var(--eff-spore)"
            label="포자"
            value={`${p.res.energy}/${cap}`}
            warn={p.res.energy > cap}
            tip="포자 안개"
            tipBody={`보유 에너지 ${p.res.energy} / 기준 ${cap}. 기준을 넘으면 초과 3마다 건강 −1.`}
          />
          <Medal onOpen={(title, body) => setOpen({ k: 'info', title, body })} icon="satellite" tone="var(--eff-sight)" label="시야" value={mods.sight} tip="시야" tipBody="퀘스트 트랙의 뒷면 카드를 칸 2부터 미리 볼 수 있는 장수. 궤도의 위성 1기마다 +1." />
        </div>
        {(p.guard > 0 || sick > 0) && (
          <div className={styles.alerts}>
            {p.guard > 0 && <span className={styles.guard}>방위 태세 +{p.guard}</span>}
            {sick > 0 && (
              // 터치 기기는 툴팁이 없으니 눌러서 정착민 시트(해결법 포함)를 연다
              <button className={`${styles.alert} ${pv.plague ? styles.danger : styles.warn}`} onClick={() => setOpen({ k: 'colonist' })}>
                {pv.plague && <Icon name="threat" size={14} />}
                {pv.plague ? `역병 예정 — 불건강 ${sick} > 유휴 ${p.idle}` : `불건강 ${sick} ≤ 유휴 ${p.idle}`}
              </button>
            )}
          </div>
        )}

        {/* 노선 트랙: 홈 파인 레일 위를 노선 문장 말이 나아간다. 4점마다 단계 징 */}
        <Legend>노선</Legend>
        <button className={styles.doctrines} onClick={() => setOpen({ k: 'doctrine' })} aria-label="노선 상세" data-tip="노선" data-tip-body={DOCTRINES.map((d) => `${DOCTRINE_NAMES[d]} ${p.doctrine[d]}점 · 단계 ${stage(p, d)}`).join('\n')}>
          {DOCTRINES.map((d) => {
            const at = Math.min(1, p.doctrine[d] / (DOCTRINE_STEP * 4));
            return (
              <span key={d} className={`${styles.track} ${main === d ? styles.trackMain : ''}`} style={{ '--tone': `var(--${d})` } as Vars}>
                <span className={styles.groove}>
                  <span className={styles.glow} style={{ width: `${at * 100}%` }} />
                  {[1, 2, 3, 4].map((st) => (
                    <i key={st} className={`${styles.stud} ${stage(p, d) >= st ? styles.studOn : ''}`} style={{ left: `${st * 25}%` }} />
                  ))}
                  <img className={styles.marker} src={EMBLEMS[d]} alt="" style={{ left: `${at * 100}%` }} draggable={false} />
                </span>
                <b>{p.doctrine[d]}</b>
              </span>
            );
          })}
        </button>

        {/* 정착민 공급 트랙: 디딤돌마다 인쇄된 식량 소비·필요 건강, 지금 디딤돌에 정착민 말 */}
        <Legend>정착민 공급 · 총 {total}명</Legend>
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
                {here && <Prop name="pawn" className={styles.segPawn} />}
                <span className={styles.segRange} aria-hidden>
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

        {/* 카드 자리 */}
        <div className={styles.cards}>
          <Slot label="후원자" icon="pioneer" tone="var(--accent)">
            {p.pioneer ? (
              <CardFace className={pop(`pio:${p.pioneer}`)} frame="pioneer" width={sizes.card} title={CARD_DEFS[p.pioneer].name} tip={`후원자\n${cardText(CARD_DEFS[p.pioneer])}`} art={{ id: p.pioneer, icon: 'pioneer' }} brief={<CardBrief card={CARD_DEFS[p.pioneer]} />} onClick={() => setOpen({ k: 'pioneer' })} />
            ) : (
              <Empty />
            )}
          </Slot>
          <Slot label={`유산 ${p.legacies.length}`} icon="legacy" tone="var(--ring3)">
            {p.legacyWip ? (
              <CardFace className={pop(`wip:${p.legacyWip.id}`)} frame="legacy" width={sizes.card} title={CARD_DEFS[p.legacyWip.id].name} tip={`유산 짓는 중 ${p.legacyWip.done}단계\n${cardText(CARD_DEFS[p.legacyWip.id])}`} badge={`${p.legacyWip.done}`} art={{ id: p.legacyWip.id, icon: 'legacy' }} brief={<CardBrief card={CARD_DEFS[p.legacyWip.id]} />} onClick={() => setOpen({ k: 'legacy' })} />
            ) : (
              <Empty />
            )}
            {p.legacies.map((id) => (
              <CardFace key={id} className={pop(`done:${id}`)} frame="legacy" width={sizes.card} title={CARD_DEFS[id].name} tip={`완성한 유산\n${cardText(CARD_DEFS[id])}`} badge="✓" art={{ id, icon: 'legacy' }} onClick={() => setOpen({ k: 'legacyDone', id })} brief={<CardBrief card={CARD_DEFS[id]} />} />
            ))}
          </Slot>
          <Slot label={`손패 ${p.hand.length}`} icon="quest" tone="var(--zone-quest)">
            {p.hand.length === 0 && <Empty />}
            {p.hand.map((h, i) =>
              !CARD_DEFS[h.id] ? (
                // 다른 사람의 손패는 뒷면만 보인다(Rules 11절)
                <CardFace key={i} frame="quest-back" width={sizes.card} label="비공개 손패" tip="비공개 손패\n다른 사람의 손패는 보이지 않습니다. 앞면이 공개된 칸에서 가져간 카드는 그때 모두가 봤으니 기억해 두세요(최근 기록에도 남습니다)." />
              ) : (
              <CardFace key={i} className={pop(`hand:${h.id}:${p.hand.slice(0, i).filter((x) => x.id === h.id).length}`)} frame={CARD_FRAME[CARD_DEFS[h.id].type]} width={sizes.card} title={CARD_DEFS[h.id].name} tip={`${CARD_TYPE_NAMES[CARD_DEFS[h.id].type]}${h.fresh ? ' · 다음 차례부터 사용' : ''}\n${cardText(CARD_DEFS[h.id])}`} dim={h.fresh} art={{ id: h.id, icon: CARD_ICON[CARD_DEFS[h.id].type] }} brief={<CardBrief card={CARD_DEFS[h.id]} />} onClick={() => setOpen({ k: 'hand', index: i })} />
              ),
            )}
          </Slot>
          <Slot label="궤도" icon="satellite" tone="var(--eff-sight)">
            {p.orbit.length === 0 && <Empty />}
            {p.orbit.map((o, i) => (
              <CardFace key={i} className={pop(`orb:${o.id}`)} frame="satellite" width={sizes.card} title={SATELLITE_DEFS[o.id].name} tip={`위성 · 남은 ${o.timer}차례\n시야 +1${modsText(SATELLITE_DEFS[o.id].mods) ? ` · ${modsText(SATELLITE_DEFS[o.id].mods)}` : ''}`} badge={o.timer} art={{ id: o.id, icon: 'satellite' }} brief={<ModsBrief mods={SATELLITE_DEFS[o.id].mods} />} onClick={() => setOpen({ k: 'orbit', index: i })} />
            ))}
          </Slot>
          {(p.patrons.length > 0 || mine) && (
            <Slot label="주둔지" icon="patron" tone="var(--zone-common)">
              {p.patrons.length === 0 && <Empty />}
              {p.patrons.map((id) => (
                <CardFace key={id} className={pop(`pat:${id}`)} frame="patron" width={sizes.card} title={PATRON_DEFS[id].name} tip={`주둔지 · ${PATRON_DEFS[id].points}점\n${modsText(PATRON_DEFS[id].mods)}\n요구: ${condText([PATRON_DEFS[id].demand])}`} badge={PATRON_DEFS[id].points} art={{ id, icon: 'patron' }} brief={<ModsBrief mods={PATRON_DEFS[id].mods} />} onClick={() => setOpen({ k: 'patron', id })} />
              ))}
            </Slot>
          )}
          {p.facilities.length > 0 && (
            <Slot label="특수 시설" icon="workshop" tone="var(--warn)">
              {p.facilities.map((id) => (
                <button key={id} className={styles.artTile} style={{ width: sizes.card }} onClick={() => setOpen({ k: 'facility', id })}>
                  <CardArt id={id} icon="workshop" tone="var(--warn)" />
                  <span>{FACILITY_DEFS[id].name}</span>
                </button>
              ))}
            </Slot>
          )}
        </div>

        {/* 헌장: 막대에 걸린 네 깃발, 단계마다 보석 */}
        <Legend>헌장</Legend>
        <div className={styles.charters}>
          {CHARTER_FIELDS.map((f) => (
            <button key={f} className={`${styles.charter} ${p.charters[f] >= 3 ? styles.charterFull : ''}`} style={{ '--lv': p.charters[f] } as Vars} onClick={() => setOpen({ k: 'charter', field: f })} data-tip={`헌장 · ${CHARTER_NAMES[f]} ${p.charters[f]}/3`} data-tip-body={p.charters[f] < 3 ? `다음 단계(문화 ${CHARTER_COST[p.charters[f] + 1]}): ${f === 'explore' && p.charters[f] === 2 ? '다음 고리 줄기까지 연구 가능' : modsText(CHARTER_MODS[f][p.charters[f] + 1])}` : `모두 채움 — 최종 점수 +${CHARTER_FULL_POINTS}`}>
              <span className={styles.pennant}>
                <Icon name="charter" size={14} />
                <span className={styles.charterName}>{CHARTER_NAMES[f]}</span>
                <span className={styles.pips}>
                  {[1, 2, 3].map((l) => (
                    <i key={l} className={p.charters[f] >= l ? styles.pipOn : ''} />
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>
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

function Slot({ label, icon, tone, children }: { label: string; icon: IconName; tone: string; children: ReactNode }) {
  return (
    <div className={styles.slot} style={{ '--tone': tone } as Vars}>
      <span className={styles.slotLabel}>
        <Icon name={icon} size={12} />
        {label}
      </span>
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

/** 상태 메달: 둥근 금속 테 안의 아이콘 + 값. 누르면 설명 시트(터치 기기·보조 기술도 같은 설명을 본다) */
function Medal({ icon, tone, label, value, warn, tip, tipBody, onOpen, say }: { icon: IconName; tone: string; label: string; value: ReactNode; warn?: boolean; tip: string; tipBody: string; onOpen: (title: string, body: string) => void; say?: string }) {
  return (
    <button
      type="button"
      className={`${styles.medal} ${warn ? styles.medalWarn : ''}`}
      style={{ '--tone': warn ? 'var(--warn)' : tone } as Vars}
      data-tip={tip}
      data-tip-body={tipBody}
      aria-label={`${label} ${say ?? (typeof value === 'string' || typeof value === 'number' ? value : '')} — 설명 보기`}
      onClick={() => onOpen(tip, tipBody)}
    >
      <span className={styles.medalFace}>
        <Icon name={icon} size={18} />
      </span>
      <span className={styles.medalText}>
        <b>{value}</b>
        <span>{label}</span>
      </span>
    </button>
  );
}

/** 앞마당 구역 이름: 땅에 새긴 듯한 작은 글자 + 양옆으로 사라지는 선 */
function Legend({ children }: { children: ReactNode }) {
  return (
    <span className={styles.legend} aria-hidden>
      {children}
    </span>
  );
}
