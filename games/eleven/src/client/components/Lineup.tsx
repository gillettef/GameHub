import { activeSide, effectiveSkill, instanceName } from '../../engine/cards';
import type { PlayerInstance, UniformToken } from '../../engine/state';
import { GK_CODE, GK_LABEL, LINE_LABEL, REGION_CODE, REGION_LABEL, regionName } from '../../engine/labels';
import { lineCounts, regionLimit, regionLine, regionSector } from '../../engine/match';
import { COLUMNS, SECTORS } from '../../engine/types';
import type { Formation, Line, Region } from '../../engine/types';
import { pressable } from '../a11y';
import { Icon } from './Icons';
import { SECTOR_LABEL } from '../labels';

// 경기 준비·진행·결과 화면이 함께 쓰는 조각: 스텝 표시줄과 잔디 위 배치판

export interface StepDef {
  label: string;
  done?: boolean; // 끝낸 스텝 (✓)
  disabled?: boolean; // 아직 갈 수 없는 스텝
  warn?: boolean; // 고칠 것이 있는 스텝
}

// 한 화면에 할 일 하나: 위쪽 스텝 표시줄. 갈 수 있는 스텝은 눌러서 언제든 되돌아간다
export function Stepper({ steps, current, onSelect }: { steps: StepDef[]; current: number; onSelect?: (index: number) => void }) {
  return (
    <ol className="stepper">
      {steps.map((s, i) => (
        <li key={i} className={`${i === current ? 'now' : ''}${s.done ? ' done' : ''}${s.warn ? ' warn' : ''}`}>
          <button type="button" disabled={s.disabled || !onSelect} aria-current={i === current ? 'step' : undefined} onClick={() => onSelect?.(i)}>
            <span className="stepper-num">{s.done && i !== current ? '✓' : i + 1}</span>
            <span className="stepper-label">{s.label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

interface PitchProps {
  roster: PlayerInstance[];
  field: UniformToken[]; // 필드 유니폼 토큰 (벤치 교환 반영)
  played: string[];
  placements: Record<string, Region>;
  formation?: Formation; // 있으면 라인별 n/m 표시 (수비-미드-공격)
  showSkill?: boolean; // 토큰에 역량 표시 (카드 없는 토큰은 1)
  skills?: Record<string, number>; // 토큰 id → 경기 판정에 실제로 쓴 역량 (결과 화면: 일시적 토큰은 경기 후 버려져 지금 카드에서는 계산할 수 없다)
  scorers?: string[]; // 득점한 토큰 id — 공 아이콘
  selected?: string | null; // 옮기려고 고른 토큰
  onToken?: (tokenId: string) => void;
  onRegion?: (region: Region) => void;
}

export function playedInstance(roster: PlayerInstance[], played: string[], token: UniformToken): PlayerInstance | undefined {
  return token.cardInstanceId && played.includes(token.cardInstanceId) ? roster.find((r) => r.instanceId === token.cardInstanceId) : undefined;
}

export function TokenChipView({ token, inst, showSkill, usedSkill, goals = 0, selected, onClick }: { token: UniformToken; inst?: PlayerInstance; showSkill?: boolean; usedSkill?: number; goals?: number; selected?: boolean; onClick?: () => void }) {
  // 훈련 전 유망주는 배치판에서도 '유망주'로만 보여야 한다 (instanceName)
  const name = inst ? instanceName(inst) : undefined;
  const skill = usedSkill ?? (inst ? effectiveSkill(inst) : 1);
  const title = `${name ?? '카드 없는 유니폼 토큰'} · ${token.face === 'attack' ? '공격' : '수비'} · 역량 ${skill}${inst ? ` · 배치 가능: ${activeSide(inst).zones.map((z) => SECTOR_LABEL[z]).join('/') || '없음'}` : ''}`;
  const body = (
    <>
      <Icon name={token.face} size={11} />
      {token.number ?? '∅'}
      {name && <span className="utoken-name">{name}</span>}
      {showSkill && <span className="utoken-skill">{skill}</span>}
      {goals > 0 && <span className="utoken-goal">{'⚽'.repeat(goals)}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={`utoken pick ${token.face}${selected ? ' chosen' : ''}`} title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {body}
    </button>
  ) : (
    <span className={`utoken ${token.face}`} title={title}>{body}</span>
  );
}

// 잔디 위 9지역 배치판 (p.20): 위에서부터 공격·미드·수비 라인, 라인마다 왼쪽(최대 1) · 중앙(1~3) · 오른쪽(최대 1). 지역마다 코드(LW CF RW / ML MC MR / DL DC DR)와
// 이름을 적고, 맨 아래 골키퍼(GK) 줄에 출전 골키퍼(없으면 역량 1·선방 1)를 보여 준다 — 골키퍼는 유니폼 토큰이 없어 지역 배치 대상이 아니다 (사용자 요청 2026-09-22).
// 라인 머리에 포메이션이 요구하는 인원(n/m)을 보여 준다. onToken/onRegion 이 있으면 토큰을 누르고 지역을 눌러 옮긴다(고른 선수가 갈 수 있는 지역을 밝게 표시)
const PITCH_LINES: readonly Line[] = ['fwd', 'mid', 'back'];

export function LineupPitch({ roster, field, played, placements, formation, showSkill, skills, scorers = [], selected, onToken, onRegion }: PitchProps) {
  const selectedToken = selected ? field.find((t) => t.id === selected) : undefined;
  const selectedInst = selectedToken ? playedInstance(roster, played, selectedToken) : undefined;
  const allowed = selectedToken ? (selectedInst ? activeSide(selectedInst).zones : SECTORS) : null;
  const need = formation && lineCounts(formation);
  const keeper = roster.find((r) => played.includes(r.instanceId) && activeSide(r).goalkeeper);
  return (
    <div className={`pitch regions${onRegion ? ' editable' : ''}`}>
      {PITCH_LINES.map((line) => {
        const inLine = field.filter((t) => placements[t.id] && regionLine(placements[t.id]!) === line).length;
        return (
          <div key={line} className="pitch-line" role="group" aria-label={`${LINE_LABEL[line]} 라인`}>
            <div className={`line-head${need ? (inLine === need[line] ? ' ok' : inLine > need[line] ? ' over' : '') : ''}`}>
              <b>{LINE_LABEL[line]}</b>
              <span>{need ? `${inLine}/${need[line]}` : inLine}</span>
            </div>
            {COLUMNS.map((col) => {
              const region: Region = `${line}-${col}`;
              const here = field.filter((t) => placements[t.id] === region);
              const { min, max } = regionLimit(region);
              const can = allowed ? allowed.includes(regionSector(region)) : null;
              const cls = `sector region col-${col}${here.length > max ? ' over' : need && here.length >= min && here.length > 0 ? ' ok' : ''}${can === null ? '' : can ? ' allowed' : ' blocked'}`;
              return (
                <div key={region} className={cls} title={`${regionName(region)} — ${col === 'C' ? '1~3명' : '최대 1명'}`} {...pressable(onRegion && selectedToken && can ? () => onRegion(region) : undefined)}>
                  <div className="sector-title">
                    <b className="region-code">{REGION_CODE[region]}</b>
                    <span className="region-name">{REGION_LABEL[region]}</span>
                    <span>{here.length}/{max}</span>
                  </div>
                  {here.map((t) => (
                    <TokenChipView
                      key={t.id}
                      token={t}
                      inst={playedInstance(roster, played, t)}
                      showSkill={showSkill || skills?.[t.id] !== undefined}
                      usedSkill={skills?.[t.id]}
                      goals={scorers.filter((id) => id === t.id).length}
                      selected={t.id === selected}
                      onClick={onToken ? () => onToken(t.id) : undefined}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
      <div className="pitch-line gk" role="group" aria-label={`${GK_LABEL} 영역`}>
        <div className="line-head">
          <b>{GK_CODE}</b>
          <span>{GK_LABEL}</span>
        </div>
        <div className="sector gk" title={`${GK_LABEL}(${GK_CODE}) — 골키퍼 카드는 유니폼 토큰 없이 골문을 지킵니다. 없으면 역량 1 · 선방 1로 봅니다`}>
          <div className="sector-title">
            <b className="region-code">{GK_CODE}</b>
            <span className="region-name">{GK_LABEL}</span>
            <span>{keeper ? '1/1' : '0/1'}</span>
          </div>
          {keeper ? (
            <span className="utoken defense keeper" title={`${instanceName(keeper)} · 골키퍼 · 역량 ${effectiveSkill(keeper)} · 선방 ${activeSide(keeper).goalkeeper!.saves}`}>
              <Icon name="defense" size={11} />
              {activeSide(keeper).number ?? 1}
              <span className="utoken-name">{instanceName(keeper)}</span>
              <span className="utoken-skill">{effectiveSkill(keeper)}</span>
              <span className="utoken-saves">선방 {activeSide(keeper).goalkeeper!.saves}</span>
            </span>
          ) : (
            <span className="utoken defense keeper none" title="골키퍼 카드가 없으면 역량 1 · 선방 1로 봅니다 (p.22)">
              <Icon name="defense" size={11} />
              <span className="utoken-name">골키퍼 없음</span>
              <span className="utoken-skill">1</span>
              <span className="utoken-saves">선방 1</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
