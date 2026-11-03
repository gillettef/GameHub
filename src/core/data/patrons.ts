// 주둔지 (Rules.md 13절). 시대별 4장
import type { PatronDef } from '../types';

export const PATRONS: PatronDef[] = [
  { id: 'pa1', era: 1, name: '궤도 조선 조합', metric: 'prodRate', mods: { income: { prod: 1 } }, demand: { metric: 'workshops', min: 3 }, points: 2, text: '배를 만들던 조합이 이제 도시를 짓는다' },
  { id: 'pa2', era: 1, name: '종자 보존 재단', metric: 'foodRate', mods: { income: { food: 1 }, health: 1 }, demand: { metric: 'farms', min: 3 }, points: 2, text: '지구 작물의 씨앗을 지키는 재단' },
  { id: 'pa3', era: 1, name: '탐사 학회', metric: 'nodes', mods: { income: { sci: 1 } }, demand: { metric: 'labs', min: 2 }, points: 2, text: '새로운 발견마다 보상을 약속한다' },
  { id: 'pa4', era: 1, name: '경비 용역단', metric: 'might', mods: { might: 2 }, demand: { metric: 'might', min: 4 }, points: 2, text: '무장한 정착지에만 투자한다' },
  { id: 'pa5', era: 2, name: '에너지 공사', metric: 'energy', mods: { income: { energy: 2 } }, demand: { metric: 'powers', min: 2 }, points: 4, text: '행성의 전력을 독점하고 싶어 한다' },
  { id: 'pa6', era: 2, name: '문화 교류 협회', metric: 'cultureRate', mods: { income: { culture: 1 } }, demand: { metric: 'halls', min: 2 }, points: 4, text: '개척지의 이야기를 지구에 전한다' },
  { id: 'pa7', era: 2, name: '생명공학 연합', metric: 'symbiont', mods: { income: { food: 1, sci: 1 } }, demand: { metric: 'symbiont', min: 6 }, points: 4, text: '토착 생물의 비밀을 원한다' },
  { id: 'pa8', era: 2, name: '방위 산업체', metric: 'might', mods: { might: 3, unitUpgradeDiscount: 1 }, demand: { metric: 'units', min: 4 }, points: 4, text: '시험할 무기가 많다' },
  { id: 'pa9', era: 3, name: '지구 정부 잔류파', metric: 'ark', mods: { health: 2, income: { culture: 1 } }, demand: { metric: 'ark', min: 10 }, points: 6, text: '개척지가 지구로 남기를 바란다' },
  { id: 'pa10', era: 3, name: '초인 연구소', metric: 'synth', mods: { income: { sci: 2 } }, demand: { metric: 'synth', min: 10 }, points: 6, text: '인간의 한계를 넘는 실험을 지원한다' },
  { id: 'pa11', era: 3, name: '행성 신탁 기금', metric: 'buildingLevels', mods: { income: { prod: 1, culture: 1 } }, demand: { metric: 'buildingLevels', min: 18 }, points: 6, text: '오래 갈 도시에 돈을 건다' },
  { id: 'pa12', era: 3, name: '심우주 항로청', metric: 'satellites', mods: { sight: 1, income: { energy: 1 } }, demand: { metric: 'satellites', min: 1 }, points: 6, text: '다음 개척지를 찾는 항로를 연다' },
];
export const PATRON_DEFS: Record<string, PatronDef> = Object.fromEntries(PATRONS.map((p) => [p.id, p]));
