import { activeSide, effectiveSkill, instanceName } from '@server/engine/cards';
import type { PlayerInstance, UniformToken } from '@server/engine/state';
import { SECTORS } from '@server/engine/types';
import type { Sector } from '@server/engine/types';
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
  placements: Record<string, Sector>;
  need?: Record<Sector, number>; // 포메이션이 요구하는 구획별 인원 (있으면 n/m 표시)
  showSkill?: boolean; // 토큰에 역량 표시 (카드 없는 토큰은 1)
  scorers?: string[]; // 득점한 토큰 id — 공 아이콘
  selected?: string | null; // 옮기려고 고른 토큰
  onToken?: (tokenId: string) => void;
  onSector?: (sector: Sector) => void;
}

export function playedInstance(roster: PlayerInstance[], played: string[], token: UniformToken): PlayerInstance | undefined {
  return token.cardInstanceId && played.includes(token.cardInstanceId) ? roster.find((r) => r.instanceId === token.cardInstanceId) : undefined;
}

export function TokenChipView({ token, inst, showSkill, goals = 0, selected, onClick }: { token: UniformToken; inst?: PlayerInstance; showSkill?: boolean; goals?: number; selected?: boolean; onClick?: () => void }) {
  // 훈련 전 유망주는 배치판에서도 '유망주'로만 보여야 한다 (instanceName)
  const name = inst ? instanceName(inst) : undefined;
  const skill = inst ? effectiveSkill(inst) : 1;
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

// 잔디 위 5구획 배치판. onToken/onSector 가 있으면 토큰을 누르고 구획을 눌러 옮긴다(고른 선수가 갈 수 있는 구획을 밝게 표시)
export function LineupPitch({ roster, field, played, placements, need, showSkill, scorers = [], selected, onToken, onSector }: PitchProps) {
  const selectedToken = selected ? field.find((t) => t.id === selected) : undefined;
  const selectedInst = selectedToken ? playedInstance(roster, played, selectedToken) : undefined;
  const allowed = selectedToken ? (selectedInst ? activeSide(selectedInst).zones : SECTORS) : null;
  return (
    <div className={`pitch${onSector ? ' editable' : ''}`}>
      {SECTORS.map((s) => {
        const here = field.filter((t) => placements[t.id] === s);
        const cls = `sector ${s}${need && here.length === need[s] ? ' ok' : ''}${need && here.length > need[s] ? ' over' : ''}${allowed ? (allowed.includes(s) ? ' allowed' : ' blocked') : ''}`;
        return (
          <div key={s} className={cls} onClick={onSector && selectedToken ? () => onSector(s) : undefined}>
            <div className="sector-title">{SECTOR_LABEL[s]} {need && <span>{here.length}/{need[s]}</span>}</div>
            {here.map((t) => (
              <TokenChipView
                key={t.id}
                token={t}
                inst={playedInstance(roster, played, t)}
                showSkill={showSkill}
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
}
