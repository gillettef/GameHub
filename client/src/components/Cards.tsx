import { activeSide, cards, effectiveSkill } from '@server/engine/cards';
import type { PlayerInstance } from '@server/engine/state';
import type { DieColor, PlayerToken, Sector } from '@server/engine/types';
import { COLOR_LABEL, KIND_LABEL, SECTOR_LABEL, SET_LABEL, TIMING_LABEL, describeCost as describeCostText, describeEffects } from '../labels';
import { Chip, CostChips, EffectChips, Icon, TokenChip, TrackChip } from './Icons';

// 모든 카드는 같은 규격(208×316)과 골격을 쓴다: 왼쪽 열(pc-left) + 오른쪽(pc-main: 상단 영역 → 이름 띠 → 태그 띠 → 본문 → 바닥)

interface CardProps {
  selected?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
  compact?: boolean;
}

function Card({ className, selected, onClick, footer, children }: CardProps & { className: string; children: React.ReactNode }) {
  return (
    <div
      className={`card ${className}${selected ? ' selected' : ''}${onClick ? ' clickable' : ''}`}
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

// 왼쪽 열의 카드 종류 표시 (한 글자)
function TypeMark({ label, title }: { label: string; title: string }) {
  return <span className="type-mark" title={title}>{label}</span>;
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

function EffectRow({ label, text, cost, effects, children }: { label: string; text?: string; cost?: Parameters<typeof CostChips>[0]['cost']; effects?: Parameters<typeof EffectChips>[0]['effects']; children?: React.ReactNode }) {
  return (
    <div className="effect-row" title={text}>
      <b>{label}</b>
      {cost && <CostChips cost={cost} />}
      {effects && <EffectChips effects={effects} />}
      {children}
    </div>
  );
}

// 선수 카드 (룰북 p.15)
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
        <div className="pc-top">
          <Portrait name={card.name} tone={side.role} />
          <span className="skill-flame" title={`역량 ${skill}`}>{skill}</span>
          {instance && skill !== side.skill && <span className="skill-base">{side.skill}</span>}
          {side.number !== undefined ? <span className="number-circle">{side.number}</span> : side.goalkeeper ? <span className="number-circle gk">GK</span> : <span className="number-circle none">?</span>}
          {side.goalkeeper && <span className="corner-bottom-right small-note" title={`선방 ${side.goalkeeper.saves}`}>선방 {side.goalkeeper.saves}</span>}
        </div>
        <div className="name-band">
          <span className="clamp1">{card.name}</span>
          {instance?.trained && <span className="trained-star" title="훈련됨">★</span>}
        </div>
        <div className="tag-band clamp1">{KIND_LABEL[card.kind]}{card.tags.length > 0 && ` · ${card.tags.join(' · ')}`}</div>
        {side.effect ? (
          <>
            <div className={`timing-band ${side.effect.timing}`}>{TIMING_LABEL[side.effect.timing]}{side.effect.mandatory && ' · 강제'}</div>
            <div className="rb-box" title={side.effect.text}>
              <div className="effect-row">
                <CostChips cost={side.effect.cost} />
                <span className="arrow">→</span>
                <EffectChips effects={side.effect.effects} />
              </div>
              <div className="effect-text clamp3">{side.effect.text}</div>
            </div>
          </>
        ) : (
          <div className="rb-box">
            {side.career ? <div className="effect-text">경력 칸 · 출전 {side.career.appearances} · 득점 {side.career.goals}</div> : <div className="effect-text muted">효과 없음</div>}
          </div>
        )}
        {(tokens.length > 0 || (instance && instance.careerVP > 0)) && (
          <div className="pc-foot chips">
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

// 직원 카드 (룰북 p.17)
export function StaffCardView({ cardId, exhausted, suspension, ...props }: { cardId: string; exhausted?: boolean; suspension?: number } & CardProps) {
  const card = cards.staff(cardId);
  return (
    <Card className={`staff set-${card.set}${exhausted ? ' exhausted' : ''}`} {...props}>
      <div className="pc-left">
        <CostBadge cost={card.cost} />
        <TypeMark label={SET_LABEL[card.set].charAt(0)} title={`${SET_LABEL[card.set]} 세트`} />
        {card.action && (
          <span className="side-cost" title={`행동 비용: ${describeCostText(card.action.cost)}`}>
            <CostChips cost={card.action.cost} />
          </span>
        )}
      </div>
      <div className="pc-main">
        <div className="pc-top">
          <Portrait name={card.name} tone={`set-${card.set}`} />
          {card.minPlayers === 3 && <span className="corner-tag" title="3~4인 게임에서만">3+</span>}
          {suspension ? <span className="corner-bottom-right"><TokenChip token="suspension" count={suspension} /></span> : null}
        </div>
        <div className="name-band"><span className="clamp1">{card.name}</span></div>
        <div className="tag-band clamp1">{card.job}</div>
        <div className="rb-box">
          {card.bonus && <EffectRow label="보너스" text={describeEffects(card.bonus)} effects={card.bonus} />}
          {card.action && <EffectRow label="행동" text={card.action.text} effects={card.action.effects} />}
          {card.trait && <EffectRow label="특성" text={card.trait}><span className="trait-text clamp2">{card.trait}</span></EffectRow>}
        </div>
        <div className="pc-foot gold" title={`${SET_LABEL[card.set]} 세트 1~4장 보유 시 승점 ${card.setPoints.join('·')}`}>
          {card.setPoints.map((n, i) => (
            <span key={i} className="laurel">{n}</span>
          ))}
        </div>
      </div>
    </Card>
  );
}

// 임원 카드 (룰북 p.7): 왼쪽 열에 1~6 투표 주사위
export function ExecutiveCardView({ cardId, exhausted, ...props }: { cardId: string; exhausted?: boolean } & CardProps) {
  const card = cards.executive(cardId);
  const adjust = Object.entries(card.trackAdjust) as [keyof typeof card.trackAdjust, number][];
  return (
    <Card className={`executive${exhausted ? ' exhausted' : ''}`} {...props}>
      <div className="pc-left">
        <div className="ec-dice" title="주사위 눈별 투표 색">
          {card.votes.map((c, i) => (
            <span key={i} className={`die ${c}`} title={`${i + 1}: ${COLOR_LABEL[c]}`}>{i + 1}</span>
          ))}
        </div>
      </div>
      <div className="pc-main">
        <div className="pc-top">
          <Portrait name={card.name} tone="exec" />
          {adjust.length > 0 && (
            <div className="corner-bottom-right chips">
              {adjust.map(([t, d]) => (
                <TrackChip key={t} track={t} delta={d} />
              ))}
            </div>
          )}
        </div>
        <div className="name-band"><span className="clamp1">{card.name}</span><span className="band-sub">임원</span></div>
        <div className="tag-band clamp1" title={card.description}>{card.description}</div>
        <div className="rb-box">
          {card.bonus && <EffectRow label="보너스" text={describeEffects(card.bonus)} effects={card.bonus} />}
          {card.action && <EffectRow label="행동" text={card.action.text} cost={card.action.cost} effects={card.action.effects} />}
          {card.trait && <EffectRow label="특성" text={card.trait}><span className="trait-text clamp3">{card.trait}</span></EffectRow>}
        </div>
      </div>
    </Card>
  );
}

export function SponsorCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.sponsor(cardId);
  return (
    <Card className="sponsor" {...props}>
      <div className="pc-left">
        <TypeMark label="S" title="스폰서" />
        <Icon name="money" size={16} className="side-icon" />
      </div>
      <div className="pc-main">
        <div className="name-band"><span className="clamp1">{card.name}</span><span className="band-sub">스폰서</span></div>
        <div className="tag-band clamp2" title={card.description}>{card.description}</div>
        <div className="rb-box">
          <EffectRow label="키트" text="즉시 효과를 얻고 카드를 버립니다" effects={card.kit} />
          <EffectRow label="광고판" text="광고판 칸에 두고 카드 효과 또는 추가 보너스 중 하나" effects={card.billboard} />
          <EffectRow label="명명권" text="스타디움에 두고 효과와 추가 보너스를 모두" effects={card.naming} />
          <EffectRow label="보너스" text="광고판(택1)·명명권(추가) 보너스" effects={card.extraBonus} />
        </div>
      </div>
    </Card>
  );
}

export function BoardCardView({ cardId, highlight, ...props }: { cardId: string; highlight?: DieColor | null } & CardProps) {
  const card = cards.board(cardId);
  return (
    <Card className="board" {...props}>
      <div className="pc-left">
        <TypeMark label="이" title="이사회" />
        <span className="ec-dice static">
          {(['yellow', 'blue', 'red'] as const).map((c) => (
            <span key={c} className={`die ${c}${highlight === c ? ' win' : ''}`} />
          ))}
        </span>
      </div>
      <div className="pc-main">
        <div className="name-band"><span className="clamp1">{card.name}</span><span className="band-sub">이사회</span></div>
        <div className="tag-band clamp2" title={card.description}>{card.description}</div>
        <div className="rb-box decisions">
          {(['yellow', 'blue', 'red'] as const).map((c) => (
            <div key={c} className={`decision ${c}${highlight === c ? ' chosen' : ''}`} title={card.decisions[c].text}>
              <span className={`die ${c}`} />
              <span className="decision-text clamp2">{card.decisions[c].text}</span>
              <EffectChips effects={card.decisions[c].effects} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function TacticCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.tactic(cardId);
  return (
    <Card className="tactic" {...props}>
      <div className="pc-left">
        <TypeMark label="전" title="전술" />
        <Icon name="tactic" size={16} className="side-icon" />
      </div>
      <div className="pc-main">
        <div className="pc-top formations-top">
          {card.formations.map((f, i) => (
            <span key={i} className="formation big">{f.defenders}-{f.midfielders}-{f.forwards}</span>
          ))}
        </div>
        <div className="name-band"><span className="clamp1">{card.name}</span>{card.basic && <span className="band-sub">기본</span>}</div>
        <div className="tag-band clamp1">{card.basic ? '포메이션 2개 중 선택' : '포메이션 1개 + 효과'}</div>
        <div className="rb-box">
          {card.effect ? <div className="effect-text clamp4">{card.effect.text}</div> : <div className="effect-text muted">효과 없음</div>}
        </div>
      </div>
    </Card>
  );
}

export function ObjectiveCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.objective(cardId);
  return (
    <Card className="objective" {...props}>
      <div className="pc-left">
        <TypeMark label="목" title="목표" />
        <Icon name="vp" size={16} className="side-icon" />
      </div>
      <div className="pc-main">
        <div className="name-band"><span className="clamp1">{card.name}</span><Chip icon="vp" value="+2 / +4" /></div>
        <div className="tag-band clamp2" title={card.description}>{card.description}</div>
        <div className="rb-box">
          <EffectRow label="목표" text={card.goal}><span className="trait-text clamp3">{card.goal}</span></EffectRow>
          <EffectRow label="완벽" text={card.perfect}><span className="trait-text clamp3">{card.perfect}</span></EffectRow>
        </div>
      </div>
    </Card>
  );
}

export function OpponentCardView({ cardId, revealed, ...props }: { cardId: string; revealed?: boolean } & CardProps) {
  const card = cards.opponent(cardId);
  return (
    <Card className="opponent" {...props}>
      <div className="pc-left">
        <TypeMark label={card.tier} title={`${card.tier}부`} />
        <Icon name="goal" size={16} className="side-icon" />
      </div>
      <div className="pc-main">
        <div className="pc-top formations-top">
          <span className="formation big">{card.formation.defenders}-{card.formation.midfielders}-{card.formation.forwards}</span>
        </div>
        <div className="name-band"><span className="clamp1">{card.teamName}</span><span className="band-sub">스카우트</span></div>
        <div className="tag-band clamp2" title={card.scoutReport}>{card.scoutReport}</div>
        <div className="rb-box">
          {revealed ? (
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
          ) : (
            <div className="effect-text muted">경기 진행 때 구획별 선수가 공개됩니다</div>
          )}
        </div>
      </div>
    </Card>
  );
}
