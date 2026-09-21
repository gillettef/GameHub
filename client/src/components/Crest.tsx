import type { ReactNode } from 'react';
import type { PlayerId } from '@server/engine/state';
import { EMBLEM_IDS } from '@server/protocol';
import type { EmblemId } from '@server/protocol';
import { useStore } from '../store';

// 구단 엠블럼 프리셋 12종 (사용자 요청 2026-09): 바탕 모양(방패·원·육각·깃발·각진 방패) + 가운데 무늬. 바탕은 자리 색, 무늬는 흰색.
// 그림은 평면 도형만(DESIGN.md — 그림자·그라데이션 없음). viewBox 0 0 24 28, 무늬는 (12, 13)을 중심으로 그리고 모양에 따라 dy 만큼 내린다
type ShapeId = 'shield' | 'round' | 'hex' | 'banner' | 'heater';

const SHAPES: Record<ShapeId, { path: string; dy: number }> = {
  shield: { path: 'M12 1.2 22.4 4.2v9.6c0 6.6-4.6 10.6-10.4 13C6.2 24.4 1.6 20.4 1.6 13.8V4.2z', dy: 0 },
  round: { path: 'M12 2.6a11.4 11.4 0 1 0 0 22.8 11.4 11.4 0 0 0 0-22.8z', dy: 1 },
  hex: { path: 'M12 1.6 22.2 7.6v12.8L12 26.4 1.8 20.4V7.6z', dy: 1 },
  banner: { path: 'M2.6 2h18.8v18.4L12 26.6l-9.4-6.2z', dy: 0 },
  heater: { path: 'M2 2.4h20v11.8c0 6-4.4 9.8-10 12.2-5.6-2.4-10-6.2-10-12.2z', dy: 0 },
};

const LINE = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const EMBLEMS: Record<EmblemId, { name: string; shape: ShapeId; motif: ReactNode }> = {
  star: { name: '별', shape: 'shield', motif: <path d="M12 7 13.47 10.98 17.71 11.15 14.38 13.77 15.53 17.85 12 15.5 8.47 17.85 9.62 13.77 6.29 11.15 10.53 10.98z" /> },
  crown: { name: '왕관', shape: 'round', motif: <path d="M6 17h12l1-8-3.6 3L12 7.5 8.6 12 5 9zM6.3 18.2h11.4v1.5H6.3z" /> },
  bolt: { name: '번개', shape: 'hex', motif: <path d="M13.5 6.5 7.5 14.5h4l-1 5.5 6-8.2h-4z" /> },
  flame: { name: '불꽃', shape: 'shield', motif: <path d="M12 6.5c.6 2.6 4.6 4.6 4.6 8.4a4.6 4.6 0 0 1-9.2 0c0-1.9 1-3.2 2-4.2.2 1.3.8 2 1.5 2.3-.4-2.4.2-4.7 1.1-6.5z" /> },
  ball: {
    name: '축구공',
    shape: 'round',
    motif: (
      <>
        <circle cx="12" cy="13" r="5.7" {...LINE} strokeWidth="1.3" />
        <path d="M12 10.6 14.28 12.26 13.41 14.94H10.59L9.72 12.26z" />
        <path d="M12 10.6V7.4M14.28 12.26l3.05-.99M13.41 14.94l1.88 2.59M10.59 14.94l-1.88 2.59M9.72 12.26l-3.05-.99" {...LINE} strokeWidth="1.1" />
      </>
    ),
  },
  chevron: { name: '셰브런', shape: 'banner', motif: <path d="M6.5 8 12 12l5.5-4v2.6L12 14.6 6.5 10.6zM6.5 13 12 17l5.5-4v2.6L12 19.6 6.5 15.6z" /> },
  mountain: { name: '산', shape: 'hex', motif: <path d="M5.5 18.5 10 9.5l2.5 4.4 1.8-2.6 4.2 7.2z" /> },
  sun: {
    name: '태양',
    shape: 'heater',
    motif: (
      <>
        <circle cx="12" cy="13" r="3" />
        <path d="M16.6 13h1.8M15.25 16.25l1.28 1.28M12 17.6v1.8M8.75 16.25l-1.28 1.28M7.4 13H5.6M8.75 9.75 7.47 8.47M12 8.4V6.6M15.25 9.75l1.28-1.28" {...LINE} strokeWidth="1.5" />
      </>
    ),
  },
  wave: { name: '물결', shape: 'round', motif: <path d="M5.5 11q1.6-2.2 3.25 0t3.25 0 3.25 0 3.25 0M5.5 15.5q1.6-2.2 3.25 0t3.25 0 3.25 0 3.25 0" {...LINE} strokeWidth="1.7" /> },
  tree: { name: '나무', shape: 'banner', motif: <path d="M12 6.5 16 12h-2l3 4.5h-4V20h-2v-3.5H7l3-4.5H8z" /> },
  castle: { name: '성', shape: 'heater', motif: <path d="M6.5 7h2.2v1.8h1.9V7h2.8v1.8h1.9V7h2.2v4.2h-1.2v8.3h-2.4v-3a1.9 1.9 0 0 0-3.8 0v3H7.7v-8.3H6.5z" /> },
  diamond: { name: '다이아', shape: 'shield', motif: <path fillRule="evenodd" d="M12 6.5 17.5 13 12 19.5 6.5 13zM12 9.8 9.3 13l2.7 3.2 2.7-3.2z" /> },
};

export const EMBLEM_LIST = EMBLEM_IDS.map((id) => ({ id, ...EMBLEMS[id] }));

// 구단 엠블럼. emblem 이 있으면 그 프리셋(참가자), 없으면 방패 + 이름 첫 글자(상대 팀 — color 생략 시 회색)
export function Crest({ name, color, size = 28, emblem }: { name: string; color?: string; size?: number; emblem?: EmblemId }) {
  const preset = emblem && EMBLEMS[emblem];
  const shape = SHAPES[preset ? preset.shape : 'shield'];
  return (
    <span className={`crest${color ? '' : ' neutral'}`} style={{ '--crest': color, width: size, height: Math.round(size * 1.14), fontSize: Math.round(size * 0.46) } as React.CSSProperties} aria-hidden="true">
      <svg viewBox="0 0 24 28" focusable="false">
        <path d={shape.path} />
        {preset && <g className="crest-motif" transform={`translate(0 ${shape.dy})`}>{preset.motif}</g>}
      </svg>
      {!preset && <b>{name.trim().charAt(0)}</b>}
    </span>
  );
}

// 방 정보에서 참가자의 엠블럼을 찾는다 (게임 중에도 `room` 메시지로 계속 내려온다)
export function useEmblemOf(): (id: PlayerId) => EmblemId | undefined {
  const { room } = useStore();
  return (id) => room?.players.find((p) => p.id === id)?.emblem;
}

// 참가자의 구단 엠블럼 — 그 참가자가 대기실에서 고른 프리셋
export function PlayerCrest({ id, name, color, size }: { id: PlayerId; name: string; color?: string; size?: number }) {
  const emblemOf = useEmblemOf();
  return <Crest name={name} color={color} size={size} emblem={emblemOf(id)} />;
}
