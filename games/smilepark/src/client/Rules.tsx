import { CFG } from '../engine/engine';
import { OUTDOOR, PRINT } from '../engine/data/cards';
import { STAFF_KEYS } from '../engine/types';
import { Icon, type IconName } from './Icon';
import { STAFF_META } from './meta';

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'build',
    title: '건설',
    body: `시장에 (플레이어 수 + ${CFG.marketExtra})장의 시설 카드가 열려요. 선 플레이어부터 차례로 1장씩 지어요(라운드당 최대 ${CFG.buildsPerRound}장). 그만 지으려면 "건설 마치기". 부지는 ${CFG.slots}칸이고, 지어진 칸에 지으면 기존 시설은 환불 없이 철거돼요. 놀이기구는 만족도, 상점은 돈, 부대시설은 매 라운드 효과를 줘요.`,
  },
  {
    icon: 'promote',
    title: '홍보',
    body: `관객 그룹 카드가 (플레이어 수 × ${CFG.rowPerPlayer})장 깔려요. 이것을 보고 각자 홍보비를 몰래 정해 동시에 공개해요(낸 돈은 은행으로). 많이 낸 순서로 그룹을 1장씩 번갈아 데려오고, 동점이면 선 플레이어에서 먼 공원이 먼저예요. 데려올 수 있는 수는 ${CFG.baseGroups}그룹 + 마케팅 전문가 Lv + 이벤트예요.`,
  },
  {
    icon: 'operate',
    title: '운영',
    body: `1인 입장료($0~$${CFG.maxFee})를 정해요. 지불 한도가 입장료보다 낮은 그룹은 돌아가요. 입장한 그룹을 놀이기구 1곳에 1그룹씩 배치해요. 그룹 인원이 정원보다 많으면 배치할 수 없어요(안내 직원이 있으면 정원 +1명까지). 만족도 = 카드의 1명당 만족도 × 대상 인원 + 취향 일치 ${CFG.favBonus} + 효과·이벤트. 놀이기구를 못 탄 그룹은 1개당 만족도 -${CFG.unplacedSat}. 돈 = 입장료 × 인원 + 상점(입장 그룹 1개당 $${PRINT.shopIncome}) - 유지비. 그룹 인원이 정원과 같은(꽉 찬) 놀이기구에는 수리 토큰, 돈을 번 상점마다 쓰레기 토큰 1개.`,
  },
  {
    icon: 'manage',
    title: '관리',
    body: `엔지니어·환경 미화원(과 일부 부대시설)이 먼저 무료로 처리하고, 나머지는 돈으로 해결해요(수리 $${CFG.repairCost}, 청소 $${CFG.cleanCost}). 수리 토큰이 있는 놀이기구는 운영할 수 없어요. 인력은 라운드당 1명 고용할 수 있어요. 라운드가 끝날 때 남은 쓰레기 1개마다 만족도 -1, 치우지 않은 쓰레기는 남아서 또 감점돼요.`,
  },
];

export function RulesBody() {
  return (
    <div className="rules">
      <p className="lead">
        {CFG.rounds}라운드 동안 공원을 키워 <b>만족도</b>가 가장 높은 공원이 승리해요. {CFG.minPlayers}~{CFG.maxPlayers}인(사람·AI 섞어서, 한 기기 돌려 하기·온라인 가능). 입찰·운영·관리는 사람마다 동시에 하고, 건설·관객 고르기는 차례대로 해요. 시작 자금은 1라운드 선 플레이어 ${CFG.startMoney}, 다음 순서부터 ${CFG.seatMoney}씩 더 받아요. 2라운드부터 선 플레이어는 시계 방향으로 넘어가요.
      </p>
      <div className="callout">
        <Icon name="sparkle" size={20} />
        <div>
          <b>운영카드(이벤트)</b>
          <span>
            라운드마다 1장이 모든 공원에 똑같이 적용되고, 다음 라운드 카드도 미리 공개돼요. 야외 놀이기구는 {OUTDOOR.join('·')}, 나머지(공포형·교육형)는 실내예요. 시설 특수효과 중에는 맑음·악천후·야간·축제 같은 이벤트 아이콘에 반응하는 것이 있어요.
          </span>
        </div>
      </div>
      {STEPS.map((s, i) => (
        <div key={s.title} className="rule-step">
          <span className="rn">{i + 1}</span>
          <div>
            <h4>
              <Icon name={s.icon} size={16} /> {s.title}
            </h4>
            <p>{s.body}</p>
          </div>
        </div>
      ))}
      <div className="callout">
        <Icon name="star" size={20} />
        <div>
          <b>점수(만족도) 계산</b>
          <span>
            운영에서 얻은 만족도를 그대로 토큰으로 받아요. 쓰레기와 유지비 부족(모자란 $1마다 -1)은 만족도를 깎아요. 게임이 끝나면 남은 돈 ${CFG.moneyPerVp}마다 만족도 +1. 만족도가 같으면 남은 돈이 많은 공원이, 그것도 같으면 공동 승리예요.
          </span>
        </div>
      </div>
      <div className="callout">
        <Icon name="engineer" size={20} />
        <div>
          <b>인력 (최고 Lv.{CFG.maxStaff}, 고용비 ${CFG.hireCosts.join('/$')}, 라운드당 1명)</b>
          {STAFF_KEYS.map((k) => (
            <span key={k}>
              {STAFF_META[k].label}: {STAFF_META[k].desc}
            </span>
          ))}
        </div>
      </div>
      <div className="callout">
        <Icon name="info" size={20} />
        <div>
          <b>팁</b>
          <span>
            큰 그룹은 정원이 큰 놀이기구가 필요해요. 정원을 딱 맞게 채우면 만족도는 크지만 수리 토큰을 받으니, 한 칸 여유 있는 놀이기구에 태우는 것도 방법이에요. 입장료를 낮추면 그룹이 더 많이 들어와 상점 수익이 늘어요. 상대 이름을 탭하면 상대 공원을 볼 수 있어요.
          </span>
        </div>
      </div>
    </div>
  );
}
