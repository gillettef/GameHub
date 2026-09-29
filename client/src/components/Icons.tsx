import type { Effect, PlayerToken, Resource, Track } from '@server/engine/types';
import { DAY_LABEL, RESOURCE_LABEL, SECTOR_SHORT, TOKEN_LABEL, describeCondition, describeEffect } from '../labels';

// 16px 단색 아이콘 세트. 색은 currentColor
export type IconName = Resource | 'vp' | 'attack' | 'defense' | 'train' | 'injury' | 'suspension' | 'strength' | 'weakness' | 'tactic' | 'prospect' | 'goal' | 'die' | 'eye';

const PATHS: Record<IconName, React.ReactNode> = {
  money: (
    <>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 6.5h4.5M6 9.5h4.5M9.5 4.5a2.2 2.2 0 0 0-3 0v7a2.2 2.2 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  fandom: <path d="M2 6.5v3h2l6 3.5V3L4 6.5H2zm10 .5a2 2 0 0 1 0 2" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />,
  ops: (
    <>
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 1.5v2.3M8 12.2v2.3M1.5 8h2.3M12.2 8h2.3M3.4 3.4l1.6 1.6M11 11l1.6 1.6M3.4 12.6 5 11M11 5l1.6-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  stamina: <path d="M9 1.5 3 9h4l-1 5.5L13 7H9l1-5.5z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />,
  vp: <path d="m8 1.8 1.9 4 4.4.6-3.2 3 .8 4.4L8 11.7l-3.9 2.1.8-4.4-3.2-3 4.4-.6z" fill="currentColor" />,
  attack: (
    <>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m8 4.5 2.9 2.1-1.1 3.4H6.2L5.1 6.6z" fill="currentColor" />
    </>
  ),
  defense: <path d="M8 1.5 2.5 3.5v4.3c0 3.3 2.3 5.6 5.5 6.7 3.2-1.1 5.5-3.4 5.5-6.7V3.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  train: <path d="M8 13.5V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  injury: <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z" fill="currentColor" />,
  suspension: <rect x="4" y="2" width="8" height="12" rx="1.2" fill="currentColor" />,
  strength: (
    <>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.5v7M4.5 8h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  weakness: (
    <>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 8h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  tactic: <path d="M2 3h12v10H2zM8 3v10M2 8h12" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  prospect: <path d="M8 2v12M3 7l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  goal: <path d="M2 4h12v9H2zM2 4v9M14 4v9M5 4v9M8 4v9M11 4v9M2 7h12M2 10h12" fill="none" stroke="currentColor" strokeWidth="1" />,
  eye: (
    <>
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2.2" fill="currentColor" />
    </>
  ),
  die: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="5.5" cy="5.5" r="1.2" fill="currentColor" />
      <circle cx="10.5" cy="10.5" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </>
  ),
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// 자원/토큰 색은 CSS 변수 --c-<name> 로 정의
export function Chip({ icon, value, tone, title, children }: { icon?: IconName; value?: React.ReactNode; tone?: string; title?: string; children?: React.ReactNode }) {
  return (
    <span className={`chip ${tone ?? icon ?? ''}`} title={title}>
      {icon && <Icon name={icon} />}
      {value !== undefined && <span className="chip-value">{value}</span>}
      {children}
    </span>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// 자원 칩: 채운 바탕 = 자원 토큰을 바로 받거나 잃음 (트랙 마커와 무관).
// 얻는 것은 +, 잃거나 내는 것은 −로 항상 부호를 붙인다(사용자 요청). cost = 비용(지불)이라 −N
export function ResourceChip({ resource, amount, signedValue = false, cost = false }: { resource: Resource; amount: number; signedValue?: boolean; cost?: boolean }) {
  const value = cost ? `−${amount}` : signedValue ? signed(amount) : amount;
  const title = cost ? `${RESOURCE_LABEL[resource]} ${amount} 지불` : `${RESOURCE_LABEL[resource]} ${signedValue ? signed(amount) : amount}${signedValue ? ' (자원을 바로 받음)' : ''}`;
  return <Chip icon={resource} value={value} title={title} />;
}

// 트랙 마커 그림: 올라가는 계단 세 칸 + 마커. 자원 칩(채운 바탕 = 자원을 바로 받음)과 달리
// 트랙 칩은 흰 바탕 + 색 테두리 + 이 그림 + "트랙" 꼬리표로 "구단 보드의 마커를 옮긴다"는 뜻을 드러낸다
export function TrackGlyph({ up, size = 16 }: { up: boolean; size?: number }) {
  return (
    <svg className="icon track-glyph" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 13.5h4v-3h4v-3h4v-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {up ? <path d="M9.2 4.6 12 1.8l2.8 2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /> : <circle cx="3.5" cy="11" r="1.9" fill="currentColor" />}
    </svg>
  );
}

// 트랙 이동 칩: 자원 칩과 한눈에 구분되게 흰 바탕·테두리·트랙 그림·"트랙" 꼬리표
export function TrackChip({ track, delta }: { track: Track; delta: number }) {
  return (
    <Chip icon={track} value={<>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</>} tone={`${track} delta`} title={`${RESOURCE_LABEL[track]} 트랙 마커 ${signed(delta)}칸 (자원을 받는 게 아니라 구단 보드의 마커 이동)`}>
      <TrackGlyph up={delta > 0} />
      <span className="chip-note">트랙</span>
    </Chip>
  );
}

const TOKEN_ICON: Record<PlayerToken, IconName> = {
  injury: 'injury',
  suspension: 'suspension',
  strengthTemp: 'strength',
  strengthPerm: 'strength',
  weaknessTemp: 'weakness',
  weaknessPerm: 'weakness',
};

export function TokenChip({ token, count, note, title }: { token: PlayerToken; count: number; note?: string; title?: string }) {
  const perm = token.endsWith('Perm');
  return (
    <Chip icon={TOKEN_ICON[token]} value={count} tone={`${TOKEN_ICON[token]}${perm ? ' perm' : ''}`} title={title ?? `${TOKEN_LABEL[token]} ${count}`}>
      {perm && <span className="chip-note">영구</span>}
      {note && <span className="chip-note">{note}</span>}
    </Chip>
  );
}

export function EffectChip({ effect }: { effect: Effect }) {
  const title = describeEffect(effect);
  switch (effect.type) {
    case 'gainResource':
      return <ResourceChip resource={effect.resource} amount={effect.amount} signedValue />;
    case 'moveTrack':
      return <TrackChip track={effect.track} delta={effect.delta} />;
    case 'gainVP':
      return <Chip icon="vp" value={signed(effect.amount)} title={title} />;
    case 'trainPlayer': {
      const chip = <Chip icon="train" value={effect.count > 1 && effect.target !== 'self' ? `×${effect.count}` : undefined} title={title}>{effect.target === 'self' ? '이 선수 훈련' : effect.only === 'prospect' ? '유망주 훈련' : '훈련'}</Chip>;
      const extra = (Object.entries(effect.withTokens ?? {}) as [PlayerToken, number][]).filter(([, n]) => n > 0);
      if (extra.length === 0) return chip;
      return (
        <span className="chips cond" title={title}>
          {chip}
          <span className="chip cond-label">그 선수에</span>
          {extra.map(([t, n]) => (
            <TokenChip key={t} token={t} count={n} />
          ))}
        </span>
      );
    }
    case 'drawTactic':
      return <Chip icon="tactic" value={effect.count > 1 ? `×${effect.count}` : undefined} title={title}>전술</Chip>;
    case 'recruitProspectFree':
      return <Chip icon="prospect" title={title}>유망주 무료</Chip>;
    case 'placeStamina':
      return <Chip icon="stamina" value={`◎${effect.count}`} title={title} />;
    case 'addPlayerToken':
      return <TokenChip token={effect.token} count={effect.count} note={effect.target === 'self' ? '이 선수' : effect.spread && effect.count > 1 ? '1개씩' : undefined} title={title} />;
    case 'removePlayerToken':
      return <TokenChip token={effect.token} count={-effect.count} note={effect.target === 'self' ? '이 선수' : effect.spread && effect.count > 1 ? '1개씩' : undefined} title={title} />;
    case 'rollDie':
      return (
        <span className="chips cond" title={title}>
          <span className="chip cond-label"><Icon name="die" size={12} /> {effect.atMost} 이하</span>
          {effect.effects.map((e, i) => (
            <EffectChip key={i} effect={e} />
          ))}
          {effect.otherwise && effect.otherwise.length > 0 && (
            <>
              <span className="chip cond-label">아니면</span>
              {effect.otherwise.map((e, i) => (
                <EffectChip key={`o${i}`} effect={e} />
              ))}
            </>
          )}
        </span>
      );
    case 'scoreGoal':
      return <Chip icon="goal" value={signed(effect.amount)} tone={effect.team === 'self' ? 'goal' : 'goal-opp'} title={title}>{effect.team === 'self' ? '' : '상대'}</Chip>;
    case 'peekOpponent':
      return <Chip icon="eye" tone="goal" title={title}>상대 카드 확인</Chip>;
    case 'conditional':
      return (
        <span className="chips cond" title={title}>
          <span className="chip cond-label">{describeCondition(effect.condition)}</span>
          {effect.effects.map((e, i) => (
            <EffectChip key={i} effect={e} />
          ))}
        </span>
      );
    case 'denyGoals':
      return <Chip icon="goal" value={`−${effect.count}`} tone="goal-opp" title={title}>상대</Chip>;
    case 'extraSaves':
      return <Chip icon="defense" value={`+${effect.count}`} tone="defense" title={title}>선방</Chip>;
    case 'sectorSkill':
      return <Chip icon="strength" value={signed(effect.delta)} tone="strength" title={title}>{SECTOR_SHORT[effect.sector]} 전원</Chip>;
    case 'flipUnmatchedToken':
      return <Chip icon="attack" value={effect.count > 1 ? `×${effect.count}` : undefined} tone="attack" title={title}>토큰 뒤집기</Chip>;
    case 'discardMarketCard':
      return <Chip icon="tactic" tone="tactic" title={title}>시장 카드 버림</Chip>;
    case 'addStaffSuspension':
      return <Chip icon="suspension" value={`+${effect.count}`} tone="suspension" title={title}>직원</Chip>;
    case 'releasePlayer':
      return <Chip icon="prospect" tone="goal-opp" title={title}>선수 방출</Chip>;
    case 'restrictDay':
      return <Chip icon="suspension" tone="suspension" title={title}>{effect.week === 'next' ? '다음 주 ' : ''}{DAY_LABEL[effect.day]} {effect.mode === 'noBasic' ? '기본 행동 불가' : '카드 행동만'}</Chip>;
    case 'breakNamingSponsor':
      return <Chip icon="money" tone="goal-opp" title={title}>유니폼 계약 파기</Chip>;
    case 'passive':
      return <Chip icon="fandom" tone="vp" title={title}>{effect.passive === 'extraStand' ? '상시 관중석 +1' : '상시 승리 시 팬덤 +1'}</Chip>;
    case 'upkeepDiscount':
      return <Chip icon="money" value={`−${effect.amount}`} title={title}>유지비</Chip>;
    case 'text':
      return <span className="chip text" title={effect.text}>{effect.text}</span>;
  }
}

export function EffectChips({ effects }: { effects: readonly Effect[] }) {
  return (
    <span className="chips">
      {effects.map((e, i) => (
        <EffectChip key={i} effect={e} />
      ))}
    </span>
  );
}

export function CostChips({ cost }: { cost: Partial<Record<Resource, number>> }) {
  const entries = (Object.entries(cost) as [Resource, number][]).filter(([, n]) => n > 0);
  if (entries.length === 0) return <span className="chip free">무료</span>;
  return (
    <span className="chips">
      {entries.map(([r, n]) => (
        <ResourceChip key={r} resource={r} amount={n} cost />
      ))}
    </span>
  );
}
