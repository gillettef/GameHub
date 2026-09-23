/**
 * 순수 함수 룰 엔진 (규칙 v2, notes/Rules.md). `(state, action) => { state, error? }`.
 * 입력 state 를 변이하지 않는다. 부수효과·Math.random·Date 의존 금지. 난수는 state.rngSeed 로만.
 *
 *  sight.ts      시야 영역, 영토 (F031)
 *  placement.ts  배치 검증·적용, 즉발 마법 (F022)
 *  combat.ts     턴을 끝낼 때 자동 공격, 정비, 지속 마법 만료, 파괴·탈락 (F023, F024)
 *  scoring.ts    점수, 순위, 수입 (F020, F025)
 *  turn.ts       로비 → 시작 → 행동 단계 → 턴을 끝낼 때 자동 효과, applyAction (F018, F019)
 *  rng.ts        시드 RNG, 셔플
 */
export * from './rng.js';
export * from './sight.js';
export * from './scoring.js';
export * from './combat.js';
export * from './placement.js';
export * from './turn.js';
