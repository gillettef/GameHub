import { h } from './dom';

const RULES = [
  '시작: 각자 토큰 4개를 번갈아 배치 (예비군은 선공 🔵 10개, 후공 🔴 11개)',
  '① 예비군을 1~2개 포화되지 않은 권역에 투입 (최소 1개, 같은 권역에 2개도 가능)',
  '② 토큰이 있는 권역을 골라 모두 버스에 태움 (상대 토큰만 있어도 됨)',
  '③ 다음 권역부터 시계 방향으로 1개씩 내려놓기. 포화 권역은 건너뛰고, 놓을 곳이 없으면 남은 토큰은 낙선. 내려놓는 색 순서는 자유',
  '포화 권역이 4곳 이상이 되거나 예비군이 모두 소진되면 그 턴이 끝날 때 선거일',
  '권역별 다수 후보가 선거인단 획득 (A 8, B 7, C·D 6, E·F 4). 권역 동점이면 맨 아래 토큰(⚑ 깃발)의 색이 승리. 총점 동점이면 남은 예비군이 많은 쪽 승, 같으면 무승부',
];

export function rulesDetails(open = false): HTMLDetailsElement {
  const d = h('details', { class: 'rules' }, [
    h('summary', { text: '규칙 보기' }),
    h('ol', {}, RULES.map((r) => h('li', { text: r }))),
  ]);
  d.open = open;
  return d;
}
