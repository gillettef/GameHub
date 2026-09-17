// placeholder: 전술 카드 12장(기본 4 + 효과 8). 구조는 규칙서 p.20/p.28, 내용은 임의 (CLAUDE.md Mock 데이터 정책). 효과는 MVP 2단계
import type { TacticCard } from '../engine/types';

export const TACTIC_CARDS: TacticCard[] = [
  { id: 'tc-01', name: '기본 포메이션 A', basic: true, formations: [{ defenders: 4, midfielders: 4, forwards: 2 }, { defenders: 4, midfielders: 2, forwards: 4 }], placeholder: true },
  { id: 'tc-02', name: '기본 포메이션 B', basic: true, formations: [{ defenders: 3, midfielders: 5, forwards: 2 }, { defenders: 5, midfielders: 3, forwards: 2 }], placeholder: true },
  { id: 'tc-03', name: '기본 포메이션 C', basic: true, formations: [{ defenders: 4, midfielders: 3, forwards: 3 }, { defenders: 3, midfielders: 4, forwards: 3 }], placeholder: true },
  { id: 'tc-04', name: '기본 포메이션 D', basic: true, formations: [{ defenders: 4, midfielders: 5, forwards: 1 }, { defenders: 5, midfielders: 4, forwards: 1 }], placeholder: true },
  { id: 'tc-05', name: '잃을 게 없어', basic: false, formations: [{ defenders: 4, midfielders: 3, forwards: 3 }],
    effect: { text: '상대 팀이 리그 성적표에서 당신보다 더 높은 순위라면, 당신은 1골을 득점합니다.', effects: [{ type: 'text', text: '상대 팀이 리그 성적표에서 더 높은 순위라면 1골 득점' }] }, placeholder: true },
  { id: 'tc-06', name: '리베로', basic: false, formations: [{ defenders: 4, midfielders: 5, forwards: 1 }],
    effect: { text: '대응하는 선수 카드가 없는 유니폼 토큰 1개를 뒤집습니다.', effects: [{ type: 'text', text: '카드 없는 유니폼 토큰 1개 뒤집기' }] }, placeholder: true },
  { id: 'tc-07', name: '역습', basic: false, formations: [{ defenders: 5, midfielders: 3, forwards: 2 }],
    effect: { text: '출전 중인 [공격] 선수 1명에 1[일시적역량]을 올려놓습니다.', effects: [{ type: 'addPlayerToken', token: 'strengthTemp', count: 1 }] }, placeholder: true },
  { id: 'tc-08', name: '토탈 풋볼', basic: false, formations: [{ defenders: 3, midfielders: 4, forwards: 3 }],
    effect: { text: '이번 경기 동안 당신의 센터 미드필더 구획에 있는 선수 전원의 역량이 1 증가합니다.', effects: [{ type: 'text', text: '센터 미드필더 구획 전원 역량 +1 (이번 경기만)' }] }, placeholder: true },
  { id: 'tc-09', name: '버스 세우기', basic: false, formations: [{ defenders: 5, midfielders: 4, forwards: 1 }],
    effect: { text: '이번 경기에서 상대 팀의 첫 번째 득점을 무효로 합니다.', effects: [{ type: 'text', text: '상대 팀 첫 득점 무효' }] }, placeholder: true },
  { id: 'tc-10', name: '하이 프레스', basic: false, formations: [{ defenders: 4, midfielders: 2, forwards: 4 }],
    effect: { text: '경기 후 1[팬덤]을 얻습니다. 상대 팀이 득점하지 못했다면 추가로 1[돈]을 얻습니다.', effects: [{ type: 'gainResource', resource: 'fandom', amount: 1 }, { type: 'text', text: '상대 무득점 시 추가 1[돈]' }] }, placeholder: true },
  { id: 'tc-11', name: '티키타카', basic: false, formations: [{ defenders: 3, midfielders: 5, forwards: 2 }],
    effect: { text: '당신의 센터 미드필더 구획에서 득점했다면, 추가로 1골을 득점합니다.', effects: [{ type: 'text', text: '센터 미드필더 구획 득점 시 추가 1골' }] }, placeholder: true },
  { id: 'tc-12', name: '세트피스', basic: false, formations: [{ defenders: 4, midfielders: 4, forwards: 2 }],
    effect: { text: '당신은 1골을 득점합니다. 그런 다음 1[체력]을 잃습니다.', effects: [{ type: 'scoreGoal', team: 'self', amount: 1 }, { type: 'gainResource', resource: 'stamina', amount: -1 }] }, placeholder: true },
];
