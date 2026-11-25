// 게임 설명(요약). 정본은 notes/Rules.md
import { Sheet } from './Sheet';
import { CONFLICT_DEFENSE, ERA_TRUNK_PER_PLAYER, FEAST_CULTURE, FEAST_FOOD, FEAST_KEEP_FOOD, FEAST_MIN_FOOD, RAID_DEFENSE } from '../../engine/data/constants';

export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="게임 설명" onClose={onClose}>
      <p>
        <strong>목표</strong> — 지구를 떠난 개척민을 이끌고 행성에 정착합니다. 1·2·3시대와 종료 시대를 거쳐 <strong>문화 점수</strong>가 가장 높은 사람이 이깁니다.
      </p>
      <p>
        <strong>차례</strong> — ① 퀘스트 선택(퀘스트 트랙에서 1장, 반드시) ② (선포한 분쟁 판정) ③ 대외 단계: 습격·분쟁 선포 중 하나 ④ 지휘·방위 행동 ⑤ 생산.
      </p>
      <p>
        <strong>지휘 행동(흰 토큰)</strong> — 테크 웹 연구, 자원 팟 카드 사용, 건물 건설·업그레이드, 정착민 늘리기, 유산 짓기, 위성 발사, 헌장 구매.
      </p>
      <p>
        <strong>방위 행동(빨강 토큰)</strong> — 유닛 편성·업그레이드, 습격({RAID_DEFENSE}), 분쟁 판정({CONFLICT_DEFENSE}). 남긴 방위 행동은 다음 내 차례까지 방위력 보너스(최대 +2).
      </p>
      <p>
        <strong>테크 웹</strong> — 연구한 노드와 이어진 노드만 연구할 수 있고, 현재 시대의 고리까지만 갑니다. 줄기는 건물·유닛 레벨을 해금하고, 곁가지는 노선 점수를 줍니다.
      </p>
      <p>
        <strong>시대</strong> — 모두가 연구한 현재 고리 줄기 합이 인원 × {ERA_TRUNK_PER_PLAYER[1]}(1시대)·인원 × {ERA_TRUNK_PER_PLAYER[2]}(2시대)·인원 × {ERA_TRUNK_PER_PLAYER[3]}(3시대)가 되거나 퀘스트 덱이 바닥나면 다음 시대로 넘어갑니다(한 시대 최대 8라운드).
      </p>
      <p>
        <strong>개척 만찬</strong> — 식량이 {FEAST_MIN_FOOD} 이상이면 차례당 한 번, 식량 {FEAST_KEEP_FOOD}을 남기고 {FEAST_FOOD}마다 문화 {FEAST_CULTURE}로 바꿉니다(지휘 행동 없음) — 남는 식량을 쓰는 곳입니다(정착민 시트).
      </p>
      <p>
        <strong>퀘스트 트랙</strong> — 5칸 중 칸 1만 앞면입니다. 차례 처음에 1장을 골라 바로 처리하고(뒷면도 고를 수 있음), 뒤 카드가 당겨지고 덱에서 칸 5가 채워집니다.
        판정형(내가 조건을 만족하면 보상), 경쟁형(조건 + 비용을 내면 보상·특수 시설), 위협형(카드의 대상에게 토착 생물 공격), 주둔지 제안(지표 1위에게 주둔지), 후원자·유산·자원 팟(가져옴).
        위성을 띄우면 칸 2부터 시야만큼 뒷면 카드를 미리 볼 수 있습니다.
      </p>
      <p>
        <strong>노선</strong> — 방주·공생·합성. 점수 4·8·12·16마다 단계 보상. 상성은 방주 → 합성 → 공생 → 방주(습격·분쟁 ±2).
      </p>
      <p>
        <strong>종료</strong> — 종료 시대에 종료 묶음(결실 퀘스트 등) 카드가 칸 1에 들어오면 그 라운드와 다음 한 라운드를 더 하고 끝납니다. 결실 퀘스트 3장은 모두 정산됩니다(노선 단계 × 3, 단계 4 선착 보너스).
      </p>
    </Sheet>
  );
}
