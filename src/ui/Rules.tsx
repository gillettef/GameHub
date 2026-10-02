import { CFG } from '../game/engine';
import { Icon, type IconName } from './Icon';

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'build',
    title: '건설',
    body: `시장에 ${CFG.marketSize}장의 시설 카드가 열려요. 차례대로 한 번에 한 가지 행동(시설 건설 또는 인력 고용)을 하고, 더 하고 싶지 않으면 "건설 마치기"를 눌러요. 부지는 ${CFG.slots}칸이고, 꽉 차면 철거하고 새로 지을 수 있어요.`,
  },
  {
    icon: 'promote',
    title: '홍보',
    body: `테이블 중앙의 관객 트랙에 관객카드가 앞면으로 깔려요. 카드에는 어린이/성인, 좋아하는 시설 유형, 낼 수 있는 최대 입장료($)가 적혀 있어요. 선 플레이어부터 번갈아 한 장씩 내 입구로 데려오고, 한 라운드에 데려올 수 있는 수는 ${CFG.baseVisitors}명 + 마케팅 전문가 레벨이에요. 다 고르면 입장료($0~$${CFG.maxFee})를 정해요. 한도가 입장료보다 낮은 관객은 입구에서 돌아가요.`,
  },
  {
    icon: 'operate',
    title: '운영',
    body: '입장한 관객이 취향(유형)과 만족도가 높은 시설을 최대 2곳 이용해요. 시설은 기본 1명씩만 받을 수 있고, 수익은 이용마다 정해진 돈, 만족도는 점수로 쌓여요. 이용이 끝나면 유지비를 내요.',
  },
  {
    icon: 'manage',
    title: '관리',
    body: `이용한 시설은 고장날 수 있고 관객은 쓰레기를 남겨요. 엔지니어·환경 미화원이 먼저 무료로 처리하고, 나머지는 돈(수리 $${CFG.repairCost}, 청소 $${CFG.cleanCost})으로 해결해요. 쓰레기 2개마다 VP -1!`,
  },
];

export function RulesBody() {
  return (
    <div className="rules">
      <p className="lead">
        {CFG.rounds}라운드 동안 공원을 키워 <b>VP(만족도 점수)</b>가 가장 높은 사람이 승리해요. 시작 자금은 ${CFG.startMoney}예요.
      </p>
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
          <span>관객의 만족도가 {CFG.satPerVp}점 쌓일 때마다 VP 1점. 적자·쓰레기는 VP를 깎아요.</span>
        </div>
      </div>
      <div className="callout">
        <Icon name="info" size={20} />
        <div>
          <b>팁</b>
          <span>어린이 관객은 놀이형·패밀리형을, 성인은 스릴·공포형을 좋아해요. 상점·부대시설은 성인 만족도가 높아요. 상대 이름을 탭하면 상대 공원과 관객을 언제든 볼 수 있어요.</span>
        </div>
      </div>
    </div>
  );
}
