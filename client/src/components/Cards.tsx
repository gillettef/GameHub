import { activeSide, cards, effectiveSkill } from '@server/engine/cards';
import type { PlayerInstance } from '@server/engine/state';
import type { PlayerSide } from '@server/engine/types';
import { COLOR_LABEL, RESOURCE_ICON, RESOURCE_LABEL, SECTOR_LABEL, SET_LABEL, TOKEN_LABEL, describeCost, describeEffects } from '../labels';

interface CardProps {
  selected?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
}

function Card({ className, selected, onClick, footer, children }: CardProps & { className: string; children: React.ReactNode }) {
  return (
    <div className={`card ${className}${selected ? ' selected' : ''}${onClick ? ' clickable' : ''}`} onClick={onClick}>
      {children}
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}

function SideInfo({ side }: { side: PlayerSide }) {
  return (
    <>
      <div className="row">
        <span className={`role ${side.role}`}>{side.role === 'attack' ? '⚽ 공격' : '🛡 수비'}</span>
        <span>역량 <b>{side.skill}</b></span>
        {side.number !== undefined && <span>#{side.number}</span>}
        {side.goalkeeper && <span>골키퍼 · 선방 {side.goalkeeper.saves}</span>}
      </div>
      {side.zones.length > 0 && <div className="muted small">{side.zones.map((z) => SECTOR_LABEL[z]).join(' / ')}</div>}
      {side.effect && (
        <div className="small">
          <b>{{ beforeMatch: '경기 전', duringMatch: '경기 중', afterMatch: '경기 후' }[side.effect.timing]}</b>
          {side.effect.mandatory && ' (강제)'} · {describeCost(side.effect.cost)}: {side.effect.text}
        </div>
      )}
      {side.career && (
        <div className="muted small">경력 칸: 출전 {side.career.appearances} / 득점 {side.career.goals}</div>
      )}
    </>
  );
}

// 이적 시장(미훈련 면) 또는 보유 선수(현재 면)
export function PlayerCardView({ cardId, instance, ...props }: { cardId: string; instance?: PlayerInstance } & CardProps) {
  const card = cards.player(cardId);
  const side = instance ? activeSide(instance) : card.untrained;
  const kind = { starter: '주전', prospect: '유망주', veteran: '베테랑' }[card.kind];
  const tokens = instance ? (Object.entries(instance.tokens) as [keyof PlayerInstance['tokens'], number][]).filter(([, n]) => n > 0) : [];
  return (
    <Card className="player" {...props}>
      <div className="card-title">
        <span>{card.name}</span>
        <span className="cost">{RESOURCE_ICON.money}{side.cost}</span>
      </div>
      <div className="muted small">
        {kind}
        {instance?.trained && ' · ★ 훈련됨'}
        {instance?.exhausted && ' · 소진'}
        {card.tags.length > 0 && ` · ${card.tags.join(', ')}`}
      </div>
      <SideInfo side={side} />
      {instance && tokens.length > 0 && (
        <div className="small">
          {tokens.map(([t, n]) => (
            <span key={t} className={`token ${t}`}>{TOKEN_LABEL[t]} {n}</span>
          ))}
          {' '}→ 현재 역량 <b>{effectiveSkill(instance)}</b>
        </div>
      )}
      {instance && instance.careerVP > 0 && <div className="small">⭐ 경력 승점 {instance.careerVP}</div>}
    </Card>
  );
}

export function StaffCardView({ cardId, exhausted, suspension, ...props }: { cardId: string; exhausted?: boolean; suspension?: number } & CardProps) {
  const card = cards.staff(cardId);
  return (
    <Card className="staff" {...props}>
      <div className="card-title">
        <span>{card.name}</span>
        <span className="cost">{RESOURCE_ICON.money}{card.cost}</span>
      </div>
      <div className="muted small">
        {card.job} · {SET_LABEL[card.set]} 세트 [{card.setPoints.join('-')}]{card.minPlayers === 3 && ' · 3인+'}
        {exhausted && ' · 소진'}
        {suspension ? ` · 출장정지 ${suspension}` : ''}
      </div>
      {card.bonus && <div className="small"><b>보너스:</b> {describeEffects(card.bonus)}</div>}
      {card.action && <div className="small"><b>행동</b> ({describeCost(card.action.cost)}): {card.action.text}</div>}
      {card.trait && <div className="small"><b>특성:</b> {card.trait}</div>}
    </Card>
  );
}

export function SponsorCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.sponsor(cardId);
  return (
    <Card className="sponsor" {...props}>
      <div className="card-title"><span>{card.name}</span></div>
      <div className="muted small">{card.description}</div>
      <div className="small"><b>키트:</b> {describeEffects(card.kit)}</div>
      <div className="small"><b>광고판:</b> {describeEffects(card.billboard)}</div>
      <div className="small"><b>명명권:</b> {describeEffects(card.naming)}</div>
      <div className="small"><b>추가 보너스:</b> {describeEffects(card.extraBonus)}</div>
    </Card>
  );
}

export function ExecutiveCardView({ cardId, exhausted, ...props }: { cardId: string; exhausted?: boolean } & CardProps) {
  const card = cards.executive(cardId);
  const adjust = (Object.entries(card.trackAdjust) as [keyof typeof card.trackAdjust, number][])
    .map(([t, d]) => `${RESOURCE_LABEL[t]} ${d > 0 ? '+' : ''}${d}`)
    .join(', ');
  return (
    <Card className="executive" {...props}>
      <div className="card-title"><span>{card.name}</span>{exhausted && <span className="muted small">소진</span>}</div>
      <div className="dice">
        {card.votes.map((c, i) => (
          <span key={i} className={`die ${c}`} title={`${i + 1}: ${COLOR_LABEL[c]}`}>{i + 1}</span>
        ))}
      </div>
      <div className="muted small">{card.description}</div>
      {adjust && <div className="small"><b>능력치:</b> {adjust}</div>}
      {card.bonus && <div className="small"><b>보너스:</b> {describeEffects(card.bonus)}</div>}
      {card.action && <div className="small"><b>행동</b> ({describeCost(card.action.cost)}): {card.action.text}</div>}
      {card.trait && <div className="small"><b>특성:</b> {card.trait}</div>}
    </Card>
  );
}

export function BoardCardView({ cardId, highlight, ...props }: { cardId: string; highlight?: 'yellow' | 'blue' | 'red' | null } & CardProps) {
  const card = cards.board(cardId);
  return (
    <Card className="board" {...props}>
      <div className="card-title"><span>{card.name}</span></div>
      <div className="muted small">{card.description}</div>
      {(['yellow', 'blue', 'red'] as const).map((c) => (
        <div key={c} className={`decision ${c}${highlight === c ? ' chosen' : ''}`}>
          <b>{COLOR_LABEL[c]}</b>: {card.decisions[c].text} <span className="muted">({describeEffects(card.decisions[c].effects)})</span>
        </div>
      ))}
    </Card>
  );
}

export function TacticCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.tactic(cardId);
  return (
    <Card className="tactic" {...props}>
      <div className="card-title"><span>{card.name}</span>{card.basic && <span className="muted small">기본</span>}</div>
      <div>{card.formations.map((f) => `${f.defenders}-${f.midfielders}-${f.forwards}`).join(' 또는 ')}</div>
      {card.effect && <div className="small">{card.effect.text}</div>}
    </Card>
  );
}

export function ObjectiveCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.objective(cardId);
  return (
    <Card className="objective" {...props}>
      <div className="card-title"><span>{card.name}</span></div>
      <div className="muted small">{card.description}</div>
      <div className="small"><b>목표 (+2):</b> {card.goal}</div>
      <div className="small"><b>완벽 (+2):</b> {card.perfect}</div>
    </Card>
  );
}

export function OpponentCardView({ cardId, revealed, ...props }: { cardId: string; revealed?: boolean } & CardProps) {
  const card = cards.opponent(cardId);
  return (
    <Card className="opponent" {...props}>
      <div className="card-title"><span>{card.teamName}</span><span className="muted small">{card.tier}부</span></div>
      <div className="small">{card.scoutReport}</div>
      {revealed && (
        <div className="small">
          <div>골키퍼: 역량 {card.goalkeeper.skill} · 선방 {card.goalkeeper.saves}</div>
          {(['LW', 'CB', 'CM', 'CF', 'RW'] as const).map((s) => (
            <div key={s}>
              {SECTOR_LABEL[s]}: {card.sectors[s].map((slot) => `${slot.role === 'attack' ? '⚽' : '🛡'}${slot.skill}`).join(' ') || '—'}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
