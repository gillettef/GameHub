// 룰북 v1.2의 수치. rules/rulebook.md 3장 표와 일치해야 한다 (test/rulebook-sync.test.js가 검사).
import { DEFAULT_CONFIG } from './engine.js';

export const RULES = {
  ...DEFAULT_CONFIG,
  moveSteps: 3,
  carryLimit: 2,
  initialShards: { 2: 6, 3: 6, 4: 6 },
  spawnPerRound: { 2: 0, 3: 0, 4: 0 },
  spawnPerTurn: 1,
  endMode: 'round',
  burstOnCovered: true, // 날개 터뜨리기 (룰북 4장 별똥별)
  reshuffle: true, // 카드 더미가 비면 버린 카드를 섞어 다시 쓴다
  shardSupply: 40, // 별빛 조각 공급처
  tieBreak: 'extraRound', // 동점 결승 라운드 (최대 3번)
  target: { 2: 10, 3: 9, 4: 7 },
  anchors: {
    2: [[0, 0], [8, 4]],
    3: [[0, 1], [8, 2], [0, 3]],
    4: [[0, 0], [8, 4], [0, 4], [8, 0]],
  },
  startCarried: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] },
  startScore: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] },
};
