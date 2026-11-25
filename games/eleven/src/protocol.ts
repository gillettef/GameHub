// 화면과 GameDef 가 함께 쓰는 꾸밈 정보. 방·접속은 공통 코드(@gamehub/net)가 맡는다.
import type { Division } from './engine/types';

// 구단 엠블럼 프리셋 (사용자 요청 2026-09): 참가자마다 하나씩, 한 판에서 겹치지 않는다. 그림은 client/components/Crest.tsx
export const EMBLEM_IDS = ['star', 'crown', 'bolt', 'flame', 'ball', 'chevron', 'mountain', 'sun', 'wave', 'tree', 'castle', 'diamond'] as const;
export type EmblemId = (typeof EMBLEM_IDS)[number];

export function isEmblem(v: unknown): v is EmblemId {
  return typeof v === 'string' && (EMBLEM_IDS as readonly string[]).includes(v);
}

// 옛 화면 코드가 쓰는 방 정보 모양(store.tsx 가 공통 RoomSnapshot 에서 만든다)
export interface RoomPlayerView {
  id: string;
  name: string;
  emblem: EmblemId;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'over';
  division: Division;
  players: RoomPlayerView[];
}
