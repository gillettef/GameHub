// 코어 공개 API
export * from './types';
export { createGame, type SeatConfig } from './engine/setup';
export { applyAction } from './engine/turn';
export { ranking, scorePlayer, type ScoreBreakdown } from './engine/scoring';
export * from './engine/derive';
export { webGraph, researchBlock, researchCost, ringLimit } from './engine/research';
export { eraProgress } from './engine/era';
export { pendingChoices } from './engine/quest';
export { raidWins, swarmValue, canTarget } from './engine/external';
export { legacyTakeCost, unitUpgradeCost, buildingUpgradeCost } from './engine/actions';
