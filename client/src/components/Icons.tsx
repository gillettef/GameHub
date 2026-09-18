import type { Effect, PlayerToken, Resource, Track } from '@server/engine/types';
import { RESOURCE_LABEL, TOKEN_LABEL, describeEffect } from '../labels';

// 16px 단색 아이콘 세트. 색은 currentColor
export type IconName = Resource | 'vp' | 'attack' | 'defense' | 'train' | 'injury' | 'suspension' | 'strength' | 'weakness' | 'tactic' | 'prospect' | 'goal' | 'die';

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

export function ResourceChip({ resource, amount, signedValue = false }: { resource: Resource; amount: number; signedValue?: boolean }) {
  return <Chip icon={resource} value={signedValue ? signed(amount) : amount} title={`${RESOURCE_LABEL[resource]} ${amount}`} />;
}

// 트랙 이동 칩: 자원 칩과 구분되게 "트랙" 글자와 화살표
export function TrackChip({ track, delta }: { track: Track; delta: number }) {
  return (
    <Chip icon={track} value={<>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</>} tone={`${track} delta`} title={`${RESOURCE_LABEL[track]} 트랙 ${signed(delta)}`}>
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

export function TokenChip({ token, count }: { token: PlayerToken; count: number }) {
  const perm = token.endsWith('Perm');
  return (
    <Chip icon={TOKEN_ICON[token]} value={count} tone={`${TOKEN_ICON[token]}${perm ? ' perm' : ''}`} title={`${TOKEN_LABEL[token]} ${count}`}>
      {perm && <span className="chip-note">영구</span>}
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
    case 'trainPlayer':
      return <Chip icon="train" value={effect.count > 1 ? `×${effect.count}` : undefined} title={title}>훈련</Chip>;
    case 'drawTactic':
      return <Chip icon="tactic" value={effect.count > 1 ? `×${effect.count}` : undefined} title={title}>전술</Chip>;
    case 'recruitProspectFree':
      return <Chip icon="prospect" title={title}>유망주 무료</Chip>;
    case 'placeStamina':
      return <Chip icon="stamina" value={`◎${effect.count}`} title={title} />;
    case 'addPlayerToken':
      return <TokenChip token={effect.token} count={effect.count} />;
    case 'removePlayerToken':
      return <TokenChip token={effect.token} count={-effect.count} />;
    case 'scoreGoal':
      return <Chip icon="goal" value={signed(effect.amount)} tone={effect.team === 'self' ? 'goal' : 'goal-opp'} title={title}>{effect.team === 'self' ? '' : '상대'}</Chip>;
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
        <ResourceChip key={r} resource={r} amount={n} />
      ))}
    </span>
  );
}
