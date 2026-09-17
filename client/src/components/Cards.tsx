import { activeSide, cards, effectiveSkill } from '@server/engine/cards';
import type { PlayerInstance } from '@server/engine/state';
import type { DieColor, PlayerToken, Sector } from '@server/engine/types';
import { COLOR_LABEL, KIND_LABEL, SECTOR_LABEL, SET_LABEL, TIMING_LABEL, describeEffects } from '../labels';
import { Chip, CostChips, EffectChips, Icon, TokenChip, TrackChip } from './Icons';

interface CardProps {
  selected?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
  compact?: boolean;
}

function Card({ className, selected, onClick, footer, compact, children }: CardProps & { className: string; children: React.ReactNode }) {
  return (
    <div
      className={`card ${className}${selected ? ' selected' : ''}${onClick ? ' clickable' : ''}${compact ? ' compact' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
    >
      {children}
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}

const SECTORS_ORDER = ['LW', 'CB', 'CM', 'CF', 'RW'] as const;

// 초상화 대신: 이름 첫 글자 메달
function Portrait({ name, tone }: { name: string; tone?: string }) {
  return <span className={`portrait ${tone ?? ''}`}>{name.trim().charAt(0)}</span>;
}

// 카드 왼쪽 위의 비용 배지 (룰북: 초록 탭 + 동전 + −N)
function CostBadge({ cost }: { cost: number }) {
  return (
    <span className="cost-badge" title={`비용 ${cost}`}>
      <Icon name="money" size={13} />
      <span>−{cost}</span>
    </span>
  );
}

// 배치 가능 지역 미니 경기장 (룰북 선수 카드 3번 기호): 세로 3라인 × 가로 3열
export function MiniPitch({ zones }: { zones: Sector[] }) {
  const cell = (s: Sector | null, key: string) => <span key={key} className={`mp-cell${s && zones.includes(s) ? ' on' : ''}`} />;
  return (
    <span className="mini-pitch" title={zones.length ? zones.map((z) => SECTOR_LABEL[z]).join(', ') : '골키퍼'}>
      {cell('LW', 'a')}{cell('CF', 'b')}{cell('RW', 'c')}
      {cell('LW', 'd')}{cell('CM', 'e')}{cell('RW', 'f')}
      {cell('LW', 'g')}{cell('CB', 'h')}{cell('RW', 'i')}
    </span>
  );
}

// 선수 카드 (룰북 p.15): 왼쪽 열 = 비용·역할·지역, 오른쪽 = 초상·역량 불꽃·등번호·이름 띠·태그 띠·효과 상자
export function PlayerCardView({ cardId, instance, ...props }: { cardId: string; instance?: PlayerInstance } & CardProps) {
  const card = cards.player(cardId);
  const side = instance ? activeSide(instance) : card.untrained;
  const skill = instance ? effectiveSkill(instance) : side.skill;
  const tokens = instance ? (Object.entries(instance.tokens) as [PlayerToken, number][]).filter(([, n]) => n > 0) : [];
  return (
    <Card className={`player ${side.role}${instance?.exhausted ? ' exhausted' : ''}`} {...props}>
      <div className="pc-left">
        <CostBadge cost={side.cost} />
        <span className={`role-badge ${side.role}`} title={side.role === 'attack' ? '공격' : '수비'}><Icon name={side.role} size={15} /></span>
        <MiniPitch zones={side.zones} />
      </div>
      <div className="pc-main">
        <div className="pc-portrait">
          <Portrait name={card.name} tone={side.role} />
          <span className="skill-flame" title={`역량 ${skill}`}>{skill}</span>
          {instance && skill !== side.skill && <span className="skill-base">{side.skill}</span>}
          {side.number !== undefined ? <span className="number-circle">{side.number}</span> : side.goalkeeper ? <span className="number-circle gk">GK</span> : <span className="number-circle none">?</span>}
          {side.goalkeeper && <span className="saves-badge" title={`선방 ${side.goalkeeper.saves}`}>선방 {side.goalkeeper.saves}</span>}
        </div>
        <div className="name-band">
          <span>{card.name}</span>
          {instance?.trained && <span className="trained-star" title="훈련됨">★</span>}
        </div>
        <div className="tag-band">{KIND_LABEL[card.kind]}{card.tags.length > 0 && ` · ${card.tags.join(' · ')}`}</div>
        {side.effect ? (
          <>
            <div className={`timing-band ${side.effect.timing}`}>{TIMING_LABEL[side.effect.timing]}{side.effect.mandatory && ' · 강제'}</div>
            <div className="effect-box" title={side.effect.text}>
              <span className="effect-cost"><CostChips cost={side.effect.cost} /></span>
              <span className="effect-body"><EffectChips effects={side.effect.effects} /></span>
            </div>
          </>
        ) : (
          side.career && <div className="effect-box career">경력 칸 · 출전 {side.career.appearances} · 득점 {side.career.goals}</div>
        )}
        {(tokens.length > 0 || (instance && instance.careerVP > 0)) && (
          <div className="chips pc-tokens">
            {tokens.map(([t, n]) => (
              <TokenChip key={t} token={t} count={n} />
            ))}
            {instance && instance.careerVP > 0 && <Chip icon="vp" value={instance.careerVP} title="경력 승점" />}
          </div>
        )}
      </div>
    </Card>
  );
}

// 직원 카드 (룰북 p.17): 비용 배지, 이름/직업 띠, 세트 색 옆기둥, 보너스/행동 상자, 금색 월계관 세트 점수
export function StaffCardView({ cardId, exhausted, suspension, ...props }: { cardId: string; exhausted?: boolean; suspension?: number } & CardProps) {
  const card = cards.staff(cardId);
  return (
    <Card className={`staff set-${card.set}${exhausted ? ' exhausted' : ''}`} {...props}>
      <div className="sc-head">
        <CostBadge cost={card.cost} />
        <span className="sc-title">
          <span className="name">{card.name}</span>
          <span className="job">{card.job}</span>
        </span>
        {card.minPlayers === 3 && <span className="tag" title="3~4인 게임에서만">3+</span>}
      </div>
      <div className="sc-body">
        <div className="sc-side" title={`${SET_LABEL[card.set]} 세트`}>
          <Portrait name={card.name} tone={`set-${card.set}`} />
          {card.action && <span className="sc-action-cost"><CostChips cost={card.action.cost} /></span>}
        </div>
        <div className="sc-text">
          {card.bonus && (
            <div className="effect-row" title={describeEffects(card.bonus)}>
              <b>보너스</b>
              <EffectChips effects={card.bonus} />
            </div>
          )}
          {card.action && (
            <div className="effect-row" title={card.action.text}>
              <b>행동</b>
              <EffectChips effects={card.action.effects} />
            </div>
          )}
          {card.trait && (
            <div className="effect-row" title={card.trait}>
              <b>특성</b>
              <span className="trait-text">{card.trait}</span>
            </div>
          )}
          {suspension ? <TokenChip token="suspension" count={suspension} /> : null}
        </div>
      </div>
      <div className="sc-foot" title={`${SET_LABEL[card.set]} 세트 1~4장 보유 시 승점`}>
        {card.setPoints.map((n, i) => (
          <span key={i} className="laurel"><span>{n}</span></span>
        ))}
        <span className="set-name">{SET_LABEL[card.set]}</span>
      </div>
    </Card>
  );
}

// 임원 카드 (룰북 p.7): 초상 + 오른쪽 주사위 세로열, 능력치 조정, 능력 상자
export function ExecutiveCardView({ cardId, exhausted, ...props }: { cardId: string; exhausted?: boolean } & CardProps) {
  const card = cards.executive(cardId);
  const adjust = Object.entries(card.trackAdjust) as [keyof typeof card.trackAdjust, number][];
  return (
    <Card className={`executive${exhausted ? ' exhausted' : ''}`} {...props}>
      <div className="ec-head">
        <span className="name">{card.name}</span>
        <span className="job">임원</span>
      </div>
      <div className="ec-body">
        <div className="ec-portrait">
          <Portrait name={card.name} tone="exec" />
          {adjust.length > 0 && (
            <span className="ec-adjust">
              {adjust.map(([t, d]) => (
                <TrackChip key={t} track={t} delta={d} />
              ))}
            </span>
          )}
        </div>
        <div className="ec-dice" title="주사위 눈별 투표 색">
          {card.votes.map((c, i) => (
            <span key={i} className={`die ${c}`} title={`${i + 1}: ${COLOR_LABEL[c]}`}>{i + 1}</span>
          ))}
        </div>
      </div>
      <div className="ec-ability">
        {card.bonus && (
          <div className="effect-row" title={describeEffects(card.bonus)}>
            <b>보너스</b>
            <EffectChips effects={card.bonus} />
          </div>
        )}
        {card.action && (
          <div className="effect-row" title={card.action.text}>
            <b>행동</b>
            <CostChips cost={card.action.cost} />
            <EffectChips effects={card.action.effects} />
          </div>
        )}
        {card.trait && (
          <div className="effect-row" title={card.trait}>
            <b>특성</b>
            <span className="trait-text">{card.trait}</span>
          </div>
        )}
      </div>
      <div className="ec-desc">{card.description}</div>
    </Card>
  );
}

export function SponsorCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.sponsor(cardId);
  return (
    <Card className="sponsor" {...props}>
      <div className="card-title"><span className="name">{card.name}</span></div>
      <div className="muted small">{card.description}</div>
      <div className="effect-line"><span className="timing">키트</span><EffectChips effects={card.kit} /></div>
      <div className="effect-line"><span className="timing">광고판</span><EffectChips effects={card.billboard} /></div>
      <div className="effect-line"><span className="timing">명명권</span><EffectChips effects={card.naming} /></div>
      <div className="effect-line"><span className="timing bonus">보너스</span><EffectChips effects={card.extraBonus} /></div>
    </Card>
  );
}

export function BoardCardView({ cardId, highlight, ...props }: { cardId: string; highlight?: DieColor | null } & CardProps) {
  const card = cards.board(cardId);
  return (
    <Card className="board" {...props}>
      <div className="card-title"><span className="name">{card.name}</span></div>
      <div className="muted small">{card.description}</div>
      {(['yellow', 'blue', 'red'] as const).map((c) => (
        <div key={c} className={`decision ${c}${highlight === c ? ' chosen' : ''}`}>
          <span className={`die ${c}`} />
          <span className="decision-text">{card.decisions[c].text}</span>
          <EffectChips effects={card.decisions[c].effects} />
        </div>
      ))}
    </Card>
  );
}

export function TacticCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.tactic(cardId);
  return (
    <Card className="tactic" {...props}>
      <div className="card-title">
        <span className="name">{card.name}</span>
        {card.basic && <span className="tag">기본</span>}
      </div>
      <div className="formations">
        {card.formations.map((f, i) => (
          <span key={i} className="formation">{f.defenders}-{f.midfielders}-{f.forwards}</span>
        ))}
      </div>
      {card.effect && <div className="trait">{card.effect.text}</div>}
    </Card>
  );
}

export function ObjectiveCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.objective(cardId);
  return (
    <Card className="objective" {...props}>
      <div className="card-title"><span className="name">{card.name}</span><Chip icon="vp" value="+2 / +4" /></div>
      <div className="muted small">{card.description}</div>
      <div className="effect-line"><span className="timing">목표</span><span>{card.goal}</span></div>
      <div className="effect-line"><span className="timing bonus">완벽</span><span>{card.perfect}</span></div>
    </Card>
  );
}

export function OpponentCardView({ cardId, revealed, ...props }: { cardId: string; revealed?: boolean } & CardProps) {
  const card = cards.opponent(cardId);
  return (
    <Card className="opponent" {...props}>
      <div className="scout-head">스카우트 보고서</div>
      <div className="card-title">
        <span className="name">{card.teamName}</span>
        <span className="tag">{card.tier}부</span>
      </div>
      <div className="muted small">{card.scoutReport}</div>
      <div className="formations"><span className="formation">{card.formation.defenders}-{card.formation.midfielders}-{card.formation.forwards}</span></div>
      {revealed && (
        <div className="opp-sectors">
          <div className="opp-row"><span className="timing">GK</span><span className="opp-slot defense">{card.goalkeeper.skill}<small>선방 {card.goalkeeper.saves}</small></span></div>
          {SECTORS_ORDER.map((s) => (
            <div key={s} className="opp-row">
              <span className="timing">{s}</span>
              {card.sectors[s].length === 0 && <span className="muted">—</span>}
              {card.sectors[s].map((slot, i) => (
                <span key={i} className={`opp-slot ${slot.role}`}><Icon name={slot.role} size={11} />{slot.skill}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
