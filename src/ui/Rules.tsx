import { CFG, OUTDOOR } from '../game/engine';
import { STAFF_KEYS } from '../game/types';
import { Icon, type IconName } from './Icon';
import { STAFF_META } from './meta';

const capText = CFG.capTiers.map(([min, n]) => `건설비 ${min} 이상 ${n}명`).join(', ');

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'build',
    title: '건설',
    body: `시장에 (플레이어 수 + ${CFG.marketExtra})장의 시설 카드가 열려요. 선 플레이어부터 차례대로 한 번에 한 가지 행동을 해요: 시설 건설, 인력 고용, 축제 개최($${CFG.festivalCost} → VP +${CFG.festivalVp}, 라운드당 1번). 더 하고 싶지 않으면 "건설 마치기"를 눌러요. 부지는 ${CFG.slots}칸이고, 꽉 차면 기존 시설을 철거(환불 없음)하고 새로 지어요. 건설비는 최소 $${CFG.minPrice}예요. 팔리지 않은 카드는 라운드가 끝나면 버려져요.`,
  },
  {
    icon: 'promote',
    title: '홍보',
    body: `관객 트랙에 관객카드가 앞면으로 깔려요. 카드에는 어린이/성인, 좋아하는 시설 유형, 낼 수 있는 최대 입장료($)가 적혀 있어요. 선 플레이어부터 번갈아 한 장씩 내 입구로 데려와요. 데려올 수 있는 수는 ${CFG.baseVisitors}명 + 마케팅 전문가 레벨 + 이벤트 보너스이고, 원하면 일찍 그만 고를 수 있어요. 다 고르면 입장료($0~$${CFG.maxFee})를 정해요. 한도가 입장료보다 낮은 관객은 입구에서 돌아가요.`,
  },
  {
    icon: 'operate',
    title: '운영',
    body: `입장한 관객은 놀이기구를 최대 ${CFG.ridesPerVisitor}곳, 그와 별도로 상점·부대시설을 ${CFG.sideStopsPerVisitor}곳 들러요. 관객은 만족도가 높고 좋아하는 유형인 시설을 스스로 골라요(같은 시설은 한 번만). 시설마다 받을 수 있는 인원이 정해져 있어요(기본 1명, ${capText}). 이용할 때마다 수익($)과 만족도가 생기고, 좋아하는 유형이면 만족도 +1이에요. 시설을 하나도 못 쓴 관객은 만족도 -${CFG.unservedSat}. 마지막에 모든 시설(고장 난 시설 포함)의 유지비를 내요.`,
  },
  {
    icon: 'manage',
    title: '관리',
    body: `이용한 시설은 ${Math.round(CFG.breakBase * 100)}% 확률로 고장나요(엔지니어 레벨마다 -${Math.round(CFG.breakPerEngineer * 100)}%p, 최소 ${Math.round(CFG.breakMin * 100)}%). 고장 난 시설은 고칠 때까지 운영하지 못해요. 관객은 시설을 이용할 때마다 ${Math.round(CFG.trashChance * 100)}% 확률로 쓰레기를 남겨요. 엔지니어·환경 미화원(과 일부 부대시설)이 먼저 무료로 처리하고, 나머지는 돈(수리 $${CFG.repairCost}, 청소 $${CFG.cleanCost})으로 해결해요. 라운드가 끝날 때 남은 쓰레기 ${CFG.trashPerVp}개마다 VP -1이고, 치우지 않은 쓰레기는 다음 라운드에도 또 감점돼요.`,
  },
];

export function RulesBody() {
  return (
    <div className="rules">
      <p className="lead">
        {CFG.rounds}라운드 동안 공원을 키워 <b>VP(승점)</b>가 가장 높은 공원이 승리해요. {CFG.minPlayers}~{CFG.maxPlayers}인(나 + AI). 시작 자금은 ${CFG.startMoney}이고, 1라운드 선 플레이어는 무작위이며 순서가 늦은 공원은 시작 자금을 조금 더 받아요. 2라운드부터 선 플레이어는 시계 방향으로 넘어가요.
      </p>
      <div className="callout">
        <Icon name="sparkle" size={20} />
        <div>
          <b>운영카드(이벤트)</b>
          <span>
            라운드마다 1장이 공개되어 모든 공원에 똑같이 적용돼요. 날씨·축제가 특정 유형의 수익·만족도를 바꾸거나, 데려올 수 있는 관객 수를 늘리거나, 정전(시설 고장)·쓰레기 대란을 일으켜요. 야외 시설은 {OUTDOOR.join('·')}, 나머지(공포형·교육형·상점·부대시설)는 실내예요. 시설 카드의 특수효과 중에는 특정 이벤트 때만 켜지는 것이 있어요.
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
          <b>VP 계산</b>
          <span>
            관객 만족도가 쌓여 {CFG.satPerVp}점이 될 때마다 VP 1점(남은 만족도는 다음 라운드로 이어지지만 게임이 끝나면 사라져요). 축제는 VP +{CFG.festivalVp}. 적자가 나면 ${CFG.debtPerVp}마다(남는 금액도 1로 셈) VP -1 하고 돈은 $0이 돼요. 쓰레기도 VP를 깎아요. VP는 0보다 낮아질 수 있어요. 게임이 끝나면 남은 돈 ${CFG.moneyPerVp}마다 VP +1. VP가 같으면 잔액이 많은 공원이, 그것도 같으면 공동 승리예요.
          </span>
        </div>
      </div>
      <div className="callout">
        <Icon name="engineer" size={20} />
        <div>
          <b>인력 (최고 Lv.{CFG.maxStaff}, 효과는 레벨마다 쌓여요)</b>
          {STAFF_KEYS.map((k) => (
            <span key={k}>
              {STAFF_META[k].label}: {STAFF_META[k].desc} · 고용비 ${CFG.hireCosts[k].join('/$')}
            </span>
          ))}
        </div>
      </div>
      <div className="callout">
        <Icon name="info" size={20} />
        <div>
          <b>팁</b>
          <span>관객의 좋아하는 유형은 카드마다 달라요. 어린이는 놀이형·패밀리형 시설의 어린이 만족도가 높고, 성인은 스릴형·상점·부대시설의 성인 만족도가 높은 편이에요. 상대 이름을 탭하면 상대 공원과 관객을 언제든 볼 수 있어요.</span>
        </div>
      </div>
    </div>
  );
}
