// 코어 공개 API
export * from './types';
export { createGame, type SeatConfig } from './rules/setup';
export { applyAction } from './rules/turn';
export { ranking, scorePlayer, type ScoreBreakdown } from './rules/scoring';
export * from './rules/derive';
export { webGraph, researchBlock, researchCost, ringLimit } from './rules/research';
export { eraProgress } from './rules/era';
export { pendingChoices } from './rules/quest';
export { raidWins, swarmValue, canTarget } from './rules/external';
export { unitUpgradeCost, buildingUpgradeCost } from './rules/actions';
