// 식민지 풍경 장면: 시대별 착륙지 그림 위에 건물·유닛 구조물, 정착민 말, 유산 기념물을 정해진 자리에 얹는다.
// 그림은 scripts/art 로 구운 WebP(docs/art.md). 자리 좌표는 assets/scene/layout.json 한 곳(굽는 스크립트도 같은 파일을 읽음).
// 누르는 영역(버튼)은 이웃 자리와 겹치지 않게 폭·높이를 줄이고, 그림은 pointer-events 없이 원래 크기로 넘친다.
import { memo, type CSSProperties } from 'react';
import type { BuildingKind, Era, PlayerState, Res, UnitKind } from '../../core/types';
import { BUILDING_KINDS, RES_KEYS, UNIT_KINDS } from '../../core/types';
import { BUILDING_NAMES, BUILDING_OUTPUT, LEVEL_NAMES, RES_NAMES, UNIT_NAMES, UNIT_POWER } from '../../core/data/constants';
import { CARD_DEFS } from '../../core/data/cards';
import { buildingCap, buildingCount, buildingUnlocked, unitRoom, unitCount, unitUnlocked, type playerMods } from '../../core/engine/derive';
import { Icon, type IconName } from './Icon';
import { Num, useFresh } from '../motion';
import { width as W, height as H, slots, building, unit, legacy } from '../assets/scene/layout.json';
import era1 from '../assets/scene/era1.webp';
import era2 from '../assets/scene/era2.webp';
import era3 from '../assets/scene/era3.webp';
import era4 from '../assets/scene/era4.webp';
import buildingsAtlas from '../assets/scene/buildings.webp';
import unitsAtlas from '../assets/scene/units.webp';
import legacyAtlas from '../assets/scene/legacy.webp';
import propsAtlas from '../assets/scene/props.webp';
import styles from './ColonyScene.module.css';

type Mods = ReturnType<typeof playerMods>;
type Vars = CSSProperties & Record<`--${string}`, string | number>;
type Cell = { w: number; h: number; base: number };

const SCENES: Record<Era, string> = { 1: era1, 2: era2, 3: era3, 4: era4 };
const ERA_PLACE: Record<Era, string> = { 1: '1시대 착륙지', 2: '2시대 정착촌', 3: '3시대 궤도 도시', 4: '종료 시대 결실' };
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

/** props.webp 칸 순서(scripts/art/props.py 의 PROPS) */
const PROP_INDEX = { pawn: 0, food: 1, prod: 2, energy: 3, sci: 4, culture: 5, cmd: 6, def: 7, empty: 8 } as const;
const PROP_COUNT = 9;
type PropName = keyof typeof PROP_INDEX;

function propStyle(name: PropName): Vars {
  return { '--atlas': `url("${propsAtlas}")`, '--ax': `${(PROP_INDEX[name] / (PROP_COUNT - 1)) * 100}%`, '--cols': PROP_COUNT };
}

export function Prop({ name, className }: { name: PropName; className?: string }) {
  return <span className={`${styles.prop} ${className ?? ''}`} style={propStyle(name)} aria-hidden />;
}

type SlotName = keyof typeof slots;
/** 장면의 세 줄(뒤 → 앞). 같은 줄 이웃과의 간격으로 누르는 폭을 정한다 */
const ROWS: SlotName[][] = [
  ['lab', 'hall', 'power', 'idle'],
  ['farm', 'workshop', 'legacy'],
  ['guard', 'rider', 'battery', 'flyer'],
];
/** 누르는 영역 높이(장면 px, scale 곱함): 땅선 위로 이만큼만. 그 위 그림은 넘쳐 보이기만 한다 */
const HIT_H = 120;
const GAP = 8;

function hitWidth(slot: SlotName, cellW: number): number {
  const s = slots[slot];
  const row = ROWS.find((r) => r.includes(slot))!;
  const i = row.indexOf(slot);
  const near = [row[i - 1], row[i + 1]].filter(Boolean).map((n) => Math.abs(slots[n].x - s.x));
  return Math.min(cellW * s.scale, Math.min(...near) - GAP);
}

/** 자리 상자: 버튼 위치·폭(%)과, 그 안에서 그림 칸을 땅선에 맞춰 넘치게 놓는 변수 */
function slotBox(slot: SlotName, cell: Cell): Vars {
  const s = slots[slot];
  const hw = hitWidth(slot, cell.w);
  const hh = HIT_H * s.scale;
  const aw = cell.w * s.scale;
  return {
    left: pct(s.x - hw / 2, W),
    top: pct(s.base - hh, H),
    width: pct(hw, W),
    '--stage-ratio': `${hw.toFixed(1)} / ${hh.toFixed(1)}`,
    '--cell-ratio': `${cell.w} / ${cell.h}`,
    '--art-w': pct(aw, hw),
    '--art-left': pct((hw - aw) / 2, hw),
    '--art-bottom': pct(-(cell.h - cell.base) * s.scale, hh),
  };
}

function atlasStyle(url: string, cols: number, rows: number, col: number, row: number): Vars {
  return {
    '--atlas': `url("${url}")`,
    '--cols': cols,
    '--rows': rows,
    '--ax': `${cols > 1 ? (col / (cols - 1)) * 100 : 0}%`,
    '--ay': `${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
  };
}

/** 유산 광장에 그림으로 세우는 최대 수(넘치면 +n). 360px 에서도 기념물 하나가 44px 이상 */
const PLAZA_MAX = 2;

interface SceneProps {
  player: PlayerState;
  era: Era;
  mods: Mods;
  /** 화면 맨 위 판(내 판)이면 배경을 바로 불러온다 */
  eager?: boolean;
  onBuilding: (k: BuildingKind) => void;
  onUnit: (k: UnitKind) => void;
  onColonist: () => void;
  onLegacy: () => void;
  onLegacyDone: (id: string) => void;
  net: Record<keyof Res, number>;
  upkeep: number;
}

/**
 * 풍경은 그림·버튼이 많다. 판의 플레이어·시대·생산이 그대로면 다시 그리지 않는다
 * (상태는 행동마다 깊은 복사라 객체가 늘 새것 — 값으로 비교). 콜백은 시트 열기만 하므로 비교에서 뺀다
 */
export const ColonyScene = memo(ColonySceneView, (a, b) => a.era === b.era && a.eager === b.eager && a.upkeep === b.upkeep && JSON.stringify(a.net) === JSON.stringify(b.net) && JSON.stringify(a.player) === JSON.stringify(b.player));

function ColonySceneView({ player: p, era, mods, eager = false, onBuilding, onUnit, onColonist, onLegacy, onLegacyDone, net, upkeep }: SceneProps) {
  const fresh = useFresh(800);
  const pop = (key: string) => (fresh(key) ? 'anim-pop' : '');

  // 기념물: 짓는 중 먼저, 그다음 최근에 완성한 것부터
  const monuments: { key: string; idx: number; label: string; tip: string; done?: number; onClick: () => void }[] = [];
  if (p.legacyWip && CARD_DEFS[p.legacyWip.id]) {
    const n = CARD_DEFS[p.legacyWip.id].name;
    monuments.push({ key: `wip:${p.legacyWip.id}`, idx: 0, label: `유산 짓는 중: ${n} ${p.legacyWip.done}단계`, tip: `유산 짓는 중 · ${n}`, done: p.legacyWip.done, onClick: onLegacy });
  }
  p.legacies.forEach((id, i) => {
    const n = CARD_DEFS[id]?.name ?? id;
    monuments.push({ key: `done:${id}`, idx: 1 + (i % 4), label: `완성한 유산: ${n}`, tip: `완성한 유산 · ${n}`, onClick: () => onLegacyDone(id) });
  });
  const wip = monuments.filter((m) => m.done !== undefined);
  const shownMon = [...wip, ...monuments.filter((m) => m.done === undefined).reverse()].slice(0, PLAZA_MAX);
  const hiddenMon = monuments.length - shownMon.length;

  return (
    <div className={styles.scene} role="group" aria-label={`${p.name}의 정착지 풍경 · ${ERA_PLACE[era]}`}>
      <img className={styles.backdrop} src={SCENES[era]} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} />
      <ProductionBand net={net} upkeep={upkeep} />

      {BUILDING_KINDS.map((k, col) => {
        const levels = [0, 1, 2, 3].filter((l) => BUILDING_OUTPUT[k][l] != null);
        return (
          <Structure
            key={k}
            box={slotBox(k, building)}
            atlas={(l) => atlasStyle(buildingsAtlas, 5, 4, col, l)}
            name={BUILDING_NAMES[k]}
            count={buildingCount(p, k)}
            cap={buildingCap(p, k, mods)}
            levels={levels}
            have={p.buildings[k]}
            unlocked={(l) => buildingUnlocked(p, k, l)}
            tone={`var(--res-${resOf(k)})`}
            pop={(key) => pop(`b:${k}:${key}`)}
            onClick={() => onBuilding(k)}
          />
        );
      })}

      {UNIT_KINDS.map((k, col) => {
        const levels = [0, 1, 2, 3].filter((l) => UNIT_POWER[k][l] != null);
        return (
          <Structure
            key={k}
            box={slotBox(k, unit)}
            atlas={(l) => atlasStyle(unitsAtlas, 4, 4, col, l)}
            name={UNIT_NAMES[k]}
            count={unitCount(p, k)}
            cap={unitRoom(p, k, mods)}
            levels={levels}
            have={p.units[k]}
            unlocked={(l) => unitUnlocked(p, k, l)}
            tone="var(--danger)"
            pop={(key) => pop(`u:${k}:${key}`)}
            onClick={() => onUnit(k)}
          />
        );
      })}

      {/* 유산 광장: 한 줄에 최대 PLAZA_MAX 개, 나머지는 +n(모두 아래 카드 칸에도 있음) */}
      <div className={styles.plaza} style={plazaBox()}>
        <div className={styles.monuments}>
          {shownMon.map((m) => (
            <button key={m.key} className={`${styles.monument} ${pop(m.key)}`} style={atlasStyle(legacyAtlas, 5, 1, m.idx, 0)} onClick={m.onClick} aria-label={m.label} data-tip={m.tip}>
              <span className={styles.monumentArt} />
              {m.done !== undefined && <span className={styles.wipNo}>{m.done}</span>}
            </button>
          ))}
        </div>
        <span className={styles.plate}>
          <Icon name="legacy" size={14} color="var(--ring3)" />
          {/* 짓는 중은 비계 그림·단계 숫자로 보인다 */}
          유산 {p.legacies.length}
          {hiddenMon > 0 && <b>+{hiddenMon}</b>}
        </span>
      </div>

      {/* 착륙선 곁 유휴 정착민 */}
      <button className={styles.idle} style={slotBox('idle', building)} onClick={onColonist} aria-label={`유휴 정착민 ${p.idle}, 공급 ${p.pool}`} data-tip={`유휴 정착민 ${p.idle}`} data-tip-body={`공급 ${p.pool}. 건물·유닛을 지으면 유휴 정착민이 들어갑니다.`}>
        <span className={styles.stage} />
        <span className={styles.info}>
          {p.idle > 0 && (
            <span className={styles.pawns}>
              {Array.from({ length: Math.min(p.idle, 4) }, (_, i) => (
                <Prop key={i} name="pawn" className={`${styles.pawn} ${pop(`idle:${i}`)}`} />
              ))}
              {p.idle > 4 && <span className={styles.more}>×{p.idle}</span>}
            </span>
          )}
          <span className={`${styles.plate} ${styles.twoLine}`}>
            <span>
              유휴 <b>{p.idle}</b>
            </span>
            <span className={styles.sub}>공급 {p.pool}</span>
          </span>
        </span>
      </button>
    </div>
  );
}

function resOf(k: BuildingKind): keyof Res {
  return ({ farm: 'food', workshop: 'prod', power: 'energy', lab: 'sci', hall: 'culture' } as const)[k];
}

/** 유산 광장: 폭은 이웃(제작소)과 겹치지 않게, 기념물 칸 하나 = 광장 폭 / PLAZA_MAX */
function plazaBox(): Vars {
  const s = slots.legacy;
  const w = hitWidth('legacy', 10_000);
  const mw = w / PLAZA_MAX;
  const mh = (mw * legacy.h) / legacy.w;
  return { left: pct(s.x - w / 2, W), top: pct(s.base - (mh * legacy.base) / legacy.h, H), width: pct(w, W), '--mon-w': `${100 / PLAZA_MAX}%`, '--mon-ratio': `${legacy.w} / ${legacy.h}` };
}

/** 정착민 말 줄: 한 줄 고정. 말이 많으면 레벨마다 "기×6" 처럼 숫자로 줄인다 */
const PAWN_ICONS_MAX = 4;

function Structure({
  box,
  atlas,
  name,
  count,
  cap,
  levels,
  have,
  unlocked,
  tone,
  pop,
  onClick,
}: {
  box: Vars;
  atlas: (level: number) => Vars;
  name: string;
  count: number;
  cap: number;
  levels: number[];
  have: number[];
  unlocked: (l: number) => boolean;
  tone: string;
  pop: (key: string) => string;
  onClick: () => void;
}) {
  const owned = levels.filter((l) => have[l] > 0);
  const top = owned.length ? owned[owned.length - 1] : undefined;
  const firstOpen = levels.find((l) => unlocked(l));
  // 아무것도 없으면 지을 수 있는 가장 낮은 레벨을 흐릿한 그림자로(잠겼으면 첫 레벨을 더 흐리게)
  const shown = top ?? firstOpen ?? levels[0];
  const state = top !== undefined ? '' : firstOpen !== undefined ? styles.ghost : styles.locked;
  const detail = levels.map((l) => `${LEVEL_NAMES[l]} ${have[l]}${unlocked(l) ? '' : '(잠김)'}`).join(' · ');
  const pieces = owned.reduce((n, l) => n + have[l], 0);
  const compact = pieces > PAWN_ICONS_MAX;
  return (
    <button className={styles.spot} style={{ ...box, '--tone': tone } as Vars} onClick={onClick} aria-label={`${name} ${count}/${cap} · ${detail}`} data-tip={`${name} ${count}/${cap}`} data-tip-body={detail}>
      <span className={styles.stage}>
        <span key={shown} className={`${styles.art} ${state} ${top !== undefined ? pop(`lv${top}`) : ''}`} style={atlas(shown)} />
      </span>
      <span className={styles.info}>
        {owned.length > 0 && (
          <span className={styles.pawns}>
            {compact && <Prop name="pawn" className={styles.pawn} />}
            {owned.map((l) => (
              <span key={l} className={styles.group}>
                <span className={styles.lvl}>{l === 0 ? '기' : l}</span>
                {compact ? (
                  <span className={styles.more}>×{have[l]}</span>
                ) : (
                  Array.from({ length: have[l] }, (_, i) => <Prop key={i} name="pawn" className={`${styles.pawn} ${pop(`p${l}:${i}`)}`} />)
                )}
              </span>
            ))}
          </span>
        )}
        <span className={styles.plate}>
          {name}
          <b>
            {count}/{cap}
          </b>
        </span>
      </span>
    </button>
  );
}

const RES_ICON: Record<keyof Res, IconName> = { food: 'food', prod: 'prod', energy: 'energy', sci: 'sci', culture: 'culture' };

/** 생산 증감 칩 띠(장면 위쪽): 생산 단계마다 늘거나 주는 양 */
export function ProductionBand({ net, upkeep }: { net: Record<keyof Res, number>; upkeep: number }) {
  return (
    <div className={styles.band} role="group" aria-label={`생산 단계 증감 — ${RES_KEYS.map((k) => `${RES_NAMES[k]} ${net[k] >= 0 ? '+' : ''}${net[k]}`).join(', ')}`}>
      {RES_KEYS.map((k) => (
        <span key={k} className={styles.chip} style={{ color: `var(--res-${k})` }} data-tip={`${RES_NAMES[k]} 생산`} data-tip-body={`생산 단계마다 ${net[k] >= 0 ? '+' : ''}${net[k]}${k === 'food' ? `(정착민 소비 ${upkeep} 반영)` : ''}`}>
          <Icon name={RES_ICON[k]} size={14} />
          <b>{net[k] >= 0 ? `+${net[k]}` : net[k]}</b>
        </span>
      ))}
    </div>
  );
}

/** 자원 트레이: 종류별 접시에 실물 토큰 더미, 아래에 보유 수 */
const PILE_MAX = 6;
export function ResourceTray({ res, net, upkeep }: { res: Res; net: Record<keyof Res, number>; upkeep: number }) {
  return (
    <div className={styles.tray}>
      {RES_KEYS.map((k) => (
        <div
          key={k}
          className={styles.stock}
          style={{ color: `var(--res-${k})` }}
          role="group"
          aria-label={`${RES_NAMES[k]} ${res[k]}, 생산 ${net[k]}`}
          data-tip={RES_NAMES[k]}
          data-tip-body={`보유 ${res[k]} · 생산 단계마다 ${net[k] >= 0 ? '+' : ''}${net[k]}${k === 'food' ? `(소비 ${upkeep} 반영)` : ''}${k === 'culture' ? '\n문화가 곧 점수입니다.' : ''}`}
        >
          <span className={`${styles.dish} ${res[k] === 0 ? styles.dishEmpty : ''}`} aria-hidden>
            <span className={styles.pile}>
              {Array.from({ length: Math.min(res[k], PILE_MAX) }, (_, i) => (
                <Prop key={i} name={k} className={styles.token} />
              ))}
            </span>
          </span>
          <span className={styles.count}>
            <Icon name={RES_ICON[k]} size={14} />
            <strong>
              <Num value={res[k]} />
            </strong>
          </span>
          <span className={`${styles.delta} ${net[k] < 0 ? styles.minus : ''}`} aria-hidden>
            {net[k] >= 0 ? `+${net[k]}` : net[k]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 행동 구슬: 홈이 파인 받침대. 남은 것은 구슬, 쓴 것은 빈 홈 */
export function ActionBeads({ cmdMax, cmdUsed, defMax, defUsed }: { cmdMax: number; cmdUsed: number; defMax: number; defUsed: number }) {
  return (
    <div className={styles.beads}>
      <span className={styles.beadGroup} style={{ '--tone': 'var(--text)' } as Vars} role="group" aria-label={`지휘 ${cmdMax - cmdUsed}/${cmdMax}`} data-tip={`지휘 행동 ${cmdMax - cmdUsed}/${cmdMax}`} data-tip-body="연구·카드 가져오기·건설·정착민·유산·위성·헌장·경쟁 퀘스트에 씁니다.">
        <span className={styles.beadLabel}>
          <Icon name="command" size={14} />
          지휘 <b>{cmdMax - cmdUsed}</b>
        </span>
        <span className={styles.rail}>
          {Array.from({ length: cmdMax }, (_, i) => (
            <Prop key={i} name={i < cmdMax - cmdUsed ? 'cmd' : 'empty'} className={styles.bead} />
          ))}
        </span>
      </span>
      <span className={styles.beadGroup} style={{ '--tone': 'var(--danger)' } as Vars} role="group" aria-label={`방위 ${defMax - defUsed}/${defMax}`} data-tip={`방위 행동 ${defMax - defUsed}/${defMax}`} data-tip-body="유닛 편성·업그레이드, 습격(2)·분쟁 판정(3). 남기면 방위 태세(최대 +2).">
        <span className={styles.beadLabel}>
          <Icon name="defense" size={14} />
          방위 <b>{defMax - defUsed}</b>
        </span>
        <span className={styles.rail}>
          {Array.from({ length: defMax }, (_, i) => (
            <Prop key={i} name={i < defMax - defUsed ? 'def' : 'empty'} className={styles.bead} />
          ))}
        </span>
      </span>
    </div>
  );
}
