import { activeSide, cards, effectiveSkill, playerName } from '@server/engine/cards';
import type { PlayerInstance } from '@server/engine/state';
import type { DieColor, Formation, PlayerToken, Sector } from '@server/engine/types';
import { COLOR_LABEL, KIND_LABEL, SECTOR_LABEL, SET_LABEL, TIMING_LABEL, describeCost as describeCostText, describeEffects } from '../labels';
import { Chip, CostChips, EffectChips, Icon, TokenChip, TrackChip } from './Icons';

// 모든 카드는 같은 크기지만 종류마다 실루엣이 다르다:
// 선수·직원 = 왼쪽 열 + 초상, 임원 = 남색 머리띠 + 오른쪽 주사위 열, 스폰서 = 브랜드 명판,
// 이사회 = 세 색 결정 띠, 전술 = 잔디 위 포메이션, 목표 = 큰 별, 상대 팀 = 스카우트 보고서

interface CardProps {
  selected?: boolean;
  chosen?: boolean; // 방금 고른 항목 강조 (useCommit)
  spotlight?: boolean; // 다른 참가자가 방금 만진 카드 비추기 (ui.spotlight)
  onClick?: () => void;
  footer?: React.ReactNode;
  compact?: boolean;
}

function Card({ className, selected, chosen, spotlight, onClick, footer, children }: CardProps & { className: string; children: React.ReactNode }) {
  return (
    <div
      className={`card ${className}${selected ? ' selected' : ''}${chosen ? ' chosen' : ''}${spotlight ? ' spotlight' : ''}${onClick ? ' clickable' : ''}`}
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

function Portrait({ name, tone }: { name: string; tone?: string }) {
  return <span className={`portrait ${tone ?? ''}`}>{name.trim().charAt(0)}</span>;
}

function CostBadge({ cost }: { cost: number }) {
  return (
    <span className="cost-badge" title={`비용 ${cost}`}>
      <Icon name="money" size={14} />
      <span>−{cost}</span>
    </span>
  );
}

// 배치 가능 지역 미니 경기장 (룰북 선수 카드 3번 기호)
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
  const name = playerName(cardId, instance?.trained); // 유망주는 훈련 전엔 모두 '유망주', 훈련하면 본명 (사용자 결정)
  return (
    <Card className={`player ${side.role} kind-${card.kind}${instance?.exhausted ? ' exhausted' : ''}`} {...props}>
      <div className="pc-left">
        <CostBadge cost={side.cost} />
        <span className={`role-badge ${side.role}`} title={side.role === 'attack' ? '공격' : '수비'}><Icon name={side.role} size={16} /></span>
        <MiniPitch zones={side.zones} />
      </div>
      <div className="pc-main">
        <div className="pc-top">
          <Portrait name={name} tone={side.role} />
          <span className="skill-flame" title={`역량 ${skill}`}>{skill}</span>
          {instance && skill !== side.skill && <span className="skill-base">{side.skill}</span>}
          {side.number !== undefined ? <span className="number-circle">{side.number}</span> : side.goalkeeper ? <span className="number-circle gk">GK</span> : <span className="number-circle none">?</span>}
          {side.goalkeeper && <span className="corner-bottom-right note" title={`선방 ${side.goalkeeper.saves}`}>선방 {side.goalkeeper.saves}</span>}
        </div>
        <div className="name-band">
          <span className="clamp1">{name}</span>
          {instance?.trained && <span className="trained-star" title="훈련됨">★</span>}
        </div>
        {/* 종류 라벨 + 태그. 베테랑 카드는 데이터 태그에도 '베테랑'이 있어 "베테랑 · 베테랑"으로 겹치던 것을 거른다 */}
        <div className="tag-band clamp1">{[KIND_LABEL[card.kind], ...card.tags.filter((t) => t !== KIND_LABEL[card.kind])].join(' · ')}</div>
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
        {(tokens.length > 0 || (instance && (instance.careerVP > 0 || instance.stamina > 0))) && (
          <div className="pc-foot chips">
            {instance && instance.stamina > 0 && <Chip icon="stamina" value={instance.stamina} title={`카드에 올려놓은 체력 ${instance.stamina} — 출전하면 출전 체력으로 쓰이고, 남은 것은 경기 후 버려집니다`} />}
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

// 직원 카드 (룰북 p.17): 이름·직업이 맨 위 띠, 세트 색 왼쪽 열, 금색 월계관 바닥
export function StaffCardView({ cardId, exhausted, suspension, ...props }: { cardId: string; exhausted?: boolean; suspension?: number } & CardProps) {
  const card = cards.staff(cardId);
  return (
    <Card className={`staff set-${card.set}${exhausted ? ' exhausted' : ''}${suspension ? ' suspended' : ''}`} {...props}>
      <div className="staff-head">
        <span className="name clamp1">{card.name}</span>
        <span className="job">{card.job}{card.minPlayers === 3 && ' · 3인+'}</span>
      </div>
      <div className="staff-body">
        <div className="pc-left">
          <CostBadge cost={card.cost} />
          <span className="set-mark" title={`${SET_LABEL[card.set]} 세트`}>{SET_LABEL[card.set]}</span>
          {card.action && (
            <span className="side-cost" title={`행동 비용: ${describeCostText(card.action.cost)}`}>
              <CostChips cost={card.action.cost} />
            </span>
          )}
        </div>
        <div className="pc-main">
          <div className="pc-top short">
            <Portrait name={card.name} tone={`set-${card.set}`} />
            {suspension ? (
              <span className="suspended-band" title={`출장정지 ${suspension}개: 행동·특성을 쓸 수 없고 세트 승점에서 빠집니다. 경기마다 1개씩 제거되고, 게임이 끝날 때 남은 1개마다 승점 −1`}>
                <Icon name="suspension" size={13} />출장정지 ×{suspension}
              </span>
            ) : null}
          </div>
          <div className="rb-box">
            {card.bonus && <EffectRow label="보너스" text={describeEffects(card.bonus)} effects={card.bonus} />}
            {card.action && <EffectRow label="행동" text={card.action.text} effects={card.action.effects} />}
            {card.trait && <EffectRow label="특성" text={card.trait.text}><span className="trait-text clamp4">{card.trait.text}</span></EffectRow>}
          </div>
        </div>
      </div>
      <div className="staff-foot" title={`${SET_LABEL[card.set]} 세트 1~4장 보유 시 승점 ${card.setPoints.join('·')}`}>
        {card.setPoints.map((n, i) => (
          <span key={i} className="laurel">{n}</span>
        ))}
      </div>
    </Card>
  );
}

// 임원 카드 (룰북 p.7): 남색 머리띠, 초상 + 오른쪽 주사위 세로열, 설명, 능력 상자
export function ExecutiveCardView({ cardId, exhausted, ...props }: { cardId: string; exhausted?: boolean } & CardProps) {
  const card = cards.executive(cardId);
  const adjust = Object.entries(card.trackAdjust) as [keyof typeof card.trackAdjust, number][];
  return (
    <Card className={`executive${exhausted ? ' exhausted' : ''}`} {...props}>
      <div className="exec-head">
        <span className="name clamp1">{card.name}</span>
        <span className="job">임원</span>
      </div>
      <div className="exec-body">
        <div className="exec-portrait">
          <Portrait name={card.name} tone="exec" />
          {adjust.length > 0 && (
            <div className="chips exec-adjust">
              {adjust.map(([t, d]) => (
                <TrackChip key={t} track={t} delta={d} />
              ))}
            </div>
          )}
        </div>
        <div className="exec-dice" title="주사위 눈별 투표 색">
          {card.votes.map((c, i) => (
            <span key={i} className={`die ${c}`} title={`${i + 1}: ${COLOR_LABEL[c]}`}>{i + 1}</span>
          ))}
        </div>
      </div>
      <div className="exec-desc clamp2" title={card.description}>{card.description}</div>
      <div className="rb-box">
        {card.bonus && <EffectRow label="보너스" text={describeEffects(card.bonus)} effects={card.bonus} />}
        {card.action && <EffectRow label="행동" text={card.action.text} cost={card.action.cost} effects={card.action.effects} />}
        {card.trait && <EffectRow label="특성" text={card.trait.text}><span className="trait-text clamp3">{card.trait.text}</span></EffectRow>}
      </div>
    </Card>
  );
}

// 스폰서 카드: 브랜드 명판 + 계약 유형 3줄 + 보너스
// 스폰서 카드 (룰북 p.18): 브랜드 명판 + 유형별 효과 3줄(장내 방송/광고판/유니폼) + 추가 보너스. faceDown 은 유니폼 계약처럼 뒤집어 둔 카드(로고 면)
export function SponsorCardView({ cardId, badge, faceDown, ...props }: { cardId: string; badge?: string; faceDown?: boolean } & CardProps) {
  const card = cards.sponsor(cardId);
  if (faceDown) {
    return (
      <Card className="sponsor back" {...props}>
        {badge && <span className="card-badge">{badge}</span>}
        <div className="brand-plate logo">
          <span className="brand-logo" aria-hidden="true">{card.name.trim().charAt(0)}</span>
          <span className="brand-name clamp2">{card.name}</span>
          <span className="brand-tag">스폰서 로고 · 앞면이 아래로</span>
        </div>
      </Card>
    );
  }
  return (
    <Card className="sponsor" {...props}>
      {badge && <span className="card-badge">{badge}</span>}
      <div className="brand-plate">
        <span className="brand-name clamp2">{card.name}</span>
        <span className="brand-tag">스폰서</span>
      </div>
      <div className="sponsor-desc clamp2" title={card.description}>{card.description}</div>
      <div className="contract-rows">
        <div className="contract-row" title="장내 방송: 효과를 즉시 적용하고 카드를 버립니다 (제한 없음)"><span className="contract-label">장내 방송</span><EffectChips effects={card.kit} /></div>
        <div className="contract-row" title="광고판: 광고판 칸에 두고 카드 효과 또는 추가 보너스 중 하나 (최대 2장, 3번 광고판 건설 시 3장)"><span className="contract-label">광고판</span><EffectChips effects={card.billboard} /><span className="contract-or">또는 보너스</span></div>
        <div className="contract-row" title="유니폼: 스타디움 보드 왼쪽에 뒤집어 두고 효과와 추가 보너스를 모두 (1장)"><span className="contract-label">유니폼</span><EffectChips effects={card.naming} /><span className="contract-or">+ 보너스</span></div>
      </div>
      <div className="sponsor-bonus" title="추가 보너스: 광고판은 카드 효과 대신 택1, 유니폼은 효과에 더해 받음"><span className="contract-label bonus">보너스</span><EffectChips effects={card.extraBonus} /></div>
    </Card>
  );
}

// 이사회 카드: 보라 머리띠 + 사건 설명 + 노랑/파랑/빨강 결정 띠
export function BoardCardView({ cardId, highlight, ...props }: { cardId: string; highlight?: DieColor | null } & CardProps) {
  const card = cards.board(cardId);
  return (
    <Card className="board" {...props}>
      <div className="board-head">
        <span className="board-kicker">이사회</span>
        <span className="name clamp1">{card.name}</span>
      </div>
      <div className="board-desc clamp3" title={card.description}>{card.description}</div>
      <div className="decisions">
        {(['yellow', 'blue', 'red'] as const).map((c) => (
          <div key={c} className={`decision ${c}${highlight === c ? ' chosen' : ''}${highlight && highlight !== c ? ' dim' : ''}`} title={card.decisions[c].text}>
            <span className="decision-color">{COLOR_LABEL[c]}</span>
            <span className="decision-text clamp3">{card.decisions[c].text}</span>
            <EffectChips effects={card.decisions[c].effects} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// 전술 카드: 잔디 위 포메이션 점
function FormationDots({ f }: { f: Formation }) {
  const row = (n: number, key: string) => (
    <div key={key} className="fd-row">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="fd-dot" />
      ))}
    </div>
  );
  return (
    <div className="formation-dots" title={`${f.defenders}-${f.midfielders}-${f.forwards}`}>
      {row(f.forwards, 'f')}
      {row(f.midfielders, 'm')}
      {row(f.defenders, 'd')}
      <div className="fd-row"><span className="fd-dot gk" /></div>
    </div>
  );
}

export function TacticCardView({ cardId, ...props }: { cardId: string } & CardProps) {
  const card = cards.tactic(cardId);
  return (
    <Card className="tactic" {...props}>
      <div className="tactic-head">
        <span className="name clamp1">{card.name}</span>
        {card.basic && <span className="job">기본 전술</span>}
      </div>
      <div className={`tactic-pitch${card.formations.length > 1 ? ' two' : ''}`}>
        {card.formations.map((f, i) => (
          <div key={i} className="tactic-formation">
            <FormationDots f={f} />
            <span className="formation">{f.defenders}-{f.midfielders}-{f.forwards}</span>
          </div>
        ))}
      </div>
      <div className="rb-box">
        {card.effect ? <div className="effect-text clamp4">{card.effect.text}</div> : <div className="effect-text muted">포메이션 2개 중 하나를 골라 씁니다</div>}
      </div>
    </Card>
  );
}

// 목표 카드: 큰 별 + 목표/완벽 2단. level(0/1/2)을 주면 지금 달성한 단에 ✓ 를 붙인다
export function ObjectiveCardView({ cardId, level, ...props }: { cardId: string; level?: 0 | 1 | 2 } & CardProps) {
  const card = cards.objective(cardId);
  return (
    <Card className="objective" {...props}>
      <div className="objective-head">
        <span className="objective-star"><Icon name="vp" size={28} /></span>
        <span className="name clamp2">{card.name}</span>
      </div>
      <div className="objective-desc clamp2" title={card.description}>{card.description}</div>
      <div className={`objective-tier${level !== undefined && level >= 1 ? ' met' : ''}`}>
        <span className="tier-label">목표 <Chip icon="vp" value="+2" />{level !== undefined && level >= 1 && <span className="tier-met" title="지금 상태로 달성">✓ 달성</span>}</span>
        <span className="tier-text clamp3" title={card.goal}>{card.goal}</span>
      </div>
      <div className={`objective-tier perfect${level === 2 ? ' met' : ''}`}>
        <span className="tier-label">완벽 <Chip icon="vp" value="+2" />{level === 2 && <span className="tier-met" title="지금 상태로 완벽 달성">✓ 달성</span>}</span>
        <span className="tier-text clamp3" title={card.perfect}>{card.perfect}</span>
      </div>
    </Card>
  );
}

// 상대 팀 카드: 빨간 스카우트 보고서 머리띠 + 엠블럼 + 포메이션, 공개되면 구획별 선수
export function OpponentCardView({ cardId, revealed, ...props }: { cardId: string; revealed?: boolean } & CardProps) {
  const card = cards.opponent(cardId);
  return (
    <Card className="opponent" {...props}>
      <div className="scout-head">{revealed ? '상대 팀 카드' : '스카우트 보고서'}</div>
      <div className="opp-identity">
        <span className="emblem">{card.teamName.charAt(0)}</span>
        <span className="opp-name clamp2">{card.teamName}</span>
        <span className="formation big">{card.formation.defenders}-{card.formation.midfielders}-{card.formation.forwards}</span>
      </div>
      {revealed ? (
        <div className="opp-sectors">
          <div className="opp-row"><span className="opp-label">GK</span><span className="opp-slot defense">{card.goalkeeper.skill}<small>선방 {card.goalkeeper.saves}</small></span></div>
          {SECTORS_ORDER.map((s) => (
            <div key={s} className="opp-row">
              <span className="opp-label">{s}</span>
              {card.sectors[s].length === 0 && <span className="muted">—</span>}
              {card.sectors[s].map((slot, i) => (
                <span key={i} className={`opp-slot ${slot.role}`}><Icon name={slot.role} size={12} />{slot.skill}</span>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="scout-text clamp4" title={card.scoutReport}>{card.scoutReport}</div>
      )}
      <div className="opp-foot">{card.tier}부</div>
    </Card>
  );
}
