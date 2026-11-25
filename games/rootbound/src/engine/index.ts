/**
 * 순수 함수 룰 엔진 (notes/Rules.md). `(state, action) => { state, error? }`.
 * 입력 state 를 변이하지 않는다. 부수효과·Math.random·Date 의존 금지. 난수는 state.rngSeed 로만.
 *
 *  types.ts      상태·행동 타입
 *  data/         수치(constants), 식물 9종·목표 16장(species), 정원 조각(tiles)
 *  board.ts      육각 좌표, 인원별 대칭 보드 조립 (3절)
 *  influence.ts  뿌리 큐브·칸 주인·공급처·심을 수 있는 칸 (6·7절)
 *  scoring.ts    목표·점수·순위 (8·9절)
 *  turn.ts       로비 → 이번 판 식물 공개 → 라운드(가져오기 → 심기) → 종료, applyAction, 시간 초과 자동 수 (4·5·6절)
 *  rng.ts        시드 RNG, 셔플
 *  mask.ts       손 카드·카드 더미 가림
 */
export * from './types.js';
export * from './data/index.js';
export * from './rng.js';
export * from './board.js';
export * from './influence.js';
export * from './scoring.js';
export * from './turn.js';
export * from './mask.js';
