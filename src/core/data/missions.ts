// 임무 (Rules.md 14절). 비공개 2장, 달성하면 공개하고 보상
import type { MissionDef } from '../types';

export const MISSIONS: MissionDef[] = [
  { id: 'm1', name: '학자의 길', cond: [{ metric: 'labs', min: 4 }], doctrine: { synth: 1 }, points: 4, text: '연구소 4개' },
  { id: 'm2', name: '풍요의 땅', cond: [{ metric: 'farms', min: 5 }], doctrine: { symbiont: 1 }, points: 4, text: '농장 5개' },
  { id: 'm3', name: '철의 도시', cond: [{ metric: 'workshops', min: 5 }], doctrine: { synth: 1 }, points: 4, text: '제작소 5개' },
  { id: 'm4', name: '광장의 목소리', cond: [{ metric: 'halls', min: 3 }], doctrine: { ark: 1 }, points: 4, text: '회관 3개' },
  { id: 'm5', name: '난공불락', cond: [{ metric: 'might', min: 14 }], doctrine: { ark: 1 }, points: 5, text: '방위력 14' },
  { id: 'm6', name: '기병의 시대', cond: [{ metric: 'riders', min: 3 }], doctrine: { symbiont: 1 }, points: 4, text: '기동대 3개' },
  { id: 'm7', name: '하늘의 눈', cond: [{ metric: 'satellites', min: 2 }], doctrine: { synth: 1 }, points: 4, text: '위성 2기 동시 보유' },
  { id: 'm8', name: '지식의 망', cond: [{ metric: 'nodes', min: 20 }], points: 5, text: '연구 노드 20개' },
  { id: 'm9', name: '번성한 개척지', cond: [{ metric: 'colonists', min: 16 }], points: 5, text: '정착민 16명' },
  { id: 'm10', name: '유산의 수호자', cond: [{ metric: 'legacies', min: 2 }], doctrine: { ark: 1 }, points: 5, text: '유산 2개 완성' },
  { id: 'm11', name: '세 갈래 길', cond: [{ metric: 'ark', min: 4 }, { metric: 'symbiont', min: 4 }, { metric: 'synth', min: 4 }], points: 5, text: '세 노선 모두 4점 이상' },
  { id: 'm12', name: '요새 포대', cond: [{ metric: 'batteries', min: 2 }], doctrine: { ark: 1 }, points: 4, text: '포대 2개' },
];
export const MISSION_DEFS: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
