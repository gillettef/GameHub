// 규칙 요약(옛 화면의 규칙 시트와 같은 내용). 수치는 엔진 데이터에서 읽는다.
import { DEMANDS, EVENTS, EVENT_POOL, GOALS, MAX_AGENTS, MIN_AGENTS, RULES, TOTAL_ROUNDS, demandFee, demandPenalty } from '../engine'
import { Art } from './cards'
import { eventArt } from './art'

const H = ({ children }: { children: string }) => <h4 className="mt-4 mb-1 text-sm font-bold text-primary">{children}</h4>

export function RulesText() {
  const pen = RULES.penalty
  return (
    <div className="text-sm leading-relaxed">
      <H>한 줄 요약</H>
      <p className="m-0">
        당신은 선수 에이전트이면서, 남몰래 받은 <b>목표 카드</b>(고객의 주문)를 채워야 합니다. 수수료를 벌면서 목표 조건에 맞는 선수를 직접 계약시키되, 상대가 눈치채고 가로채지 않게
        하세요. ({MIN_AGENTS}~{MAX_AGENTS}인)
      </p>
      <H>준비</H>
      <p className="m-0">
        구단 6곳을 펼치고, 구단마다 그 구단의 <b>요구 카드 3장</b>(필요 포지션·선호 특성)을 섞어 맨 위 1장을 공개합니다. 각자 <b>목표 카드 {RULES.goalsPerAgent}장</b>을 몰래 받고,{' '}
        <b>
          요구 수수료 카드 4종 × {RULES.copies}장
        </b>
        ({DEMANDS.map((d) => `+${demandFee(d)}억·매력도 −${demandPenalty(d)}`).join(' / ')})을 받습니다. 카드는 <b>한 번 내면 버립니다</b>.
      </p>
      <H>{`라운드 (${TOTAL_ROUNDS}번, 라운드마다 1·2차 협상)`}</H>
      <p className="m-0">
        ① 이벤트를 공개합니다(다음 라운드 이벤트도 예고). ② 시장에 선수를{' '}
        <b>
          인원 × {RULES.marketPer} + {RULES.marketExtra}명
        </b>
        까지 채웁니다(지난 라운드에 남은 선수는 그대로). ③ 각자 <b>1차·2차 협상</b>을 한꺼번에 몰래 정합니다. 협상 1건 = <b>선수 1명, 구단 1곳, 요구 수수료 카드 1장</b>이고, 각각
        패스해도 됩니다. 2차는 1차와 <b>다른 선수·다른 구단</b>이어야 합니다. ④ 1차를 모두 공개해 정산한 뒤 2차를 공개해 정산합니다. 2차에 고른 선수가 1차에서 이미 계약되었다면 그
        2차는 <b>협상 무산</b>입니다. ⑤ 이번 라운드에 선수가 계약된 구단은 요구 카드를 더미 맨 아래로 넣고 <b>다음 요구 카드를 공개</b>합니다(다음 라운드부터 적용).
      </p>
      <H>요구 수수료 카드</H>
      <p className="m-0">
        공개한 카드는 계약 성공·실패와 관계없이 <b>버립니다</b>(패스는 그대로). {RULES.copies * DEMANDS.length}장으로 최대 {TOTAL_ROUNDS * 2}번 협상하므로{' '}
        {Math.max(0, RULES.copies * DEMANDS.length - TOTAL_ROUNDS * 2)}장 이상은 끝까지 쓰지 못합니다. 높은 카드를 어디에 쓸지, 어떤 카드를 남길지 정하세요. 마지막 데드라인 데이는
        수수료가 크니 카드를 남겨 두는 것도 방법입니다.
      </p>
      <H>계약</H>
      <p className="m-0">
        구단 <b>제시액</b>이 선수 <b>몸값</b> 이상이어야 합니다. <b>매력도 = 구단 요구 카드의 포지션 일치(+2) + 선호 특성 일치(+1) − 카드의 매력도 감점</b>(
        {DEMANDS.map((d) => `+${demandFee(d)}억 −${pen[d - 1]}`).join(', ')}). 같은 협상(1차끼리, 2차끼리)에서 같은 선수를 노리면 매력도가 가장 높은 제안이 계약합니다. 최고 매력도가
        같으면 <b>요구 수수료 카드가 낮은(수수료가 적은) 쪽</b>이 계약합니다. 카드까지 같으면 그 매력도의 제안은 <b>모두 상쇄되어 탈락</b>하고 그다음 제안이 계약합니다.
      </p>
      <H>수수료</H>
      <p className="m-0">
        수수료 = 선수 기본 수수료 + 요구 수수료(+이벤트). 계약한 선수 카드는 <b>내 앞</b>에 앞면으로 놓습니다. 누가 어떤 선수를 모았는지 모두 볼 수 있습니다.
      </p>
      <H>게임 종료 · 목표 카드</H>
      <p className="m-0">
        마지막 라운드 뒤 모두 목표 카드를 공개합니다. <b>자기가 직접</b> 계약시킨 선수로 조건을 채웠으면 카드마다 <b>+{RULES.goalBonus}억</b>, 못 채웠으면 0입니다. 스폰서 데이에
        계약한 선수는 '○명 이상' 조건에서 2명으로 셉니다. 계약 수수료 + 목표 보너스가 가장 큰 사람이 승리합니다.
      </p>
      <ul className="mt-2 mb-0 pl-5">
        {GOALS.map((g) => (
          <li key={g.id}>
            <b>{g.name}</b> — {g.desc}
          </li>
        ))}
      </ul>
      <H>이벤트</H>
      <ul className="m-0 list-none p-0">
        {[...EVENT_POOL, 'deadline' as const].map((k) => (
          <li key={k} className="flex items-center gap-2 py-1">
            <Art svg={eventArt(k, EVENTS[k].name)} className="h-9 w-16 shrink-0 rounded-md bg-[var(--da-art)]" />
            <span>
              <b>{EVENTS[k].name}</b> — {EVENTS[k].desc}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted">
        {EVENT_POOL.length}장 중 {TOTAL_ROUNDS - 1}장을 무작위로 쓰고, 마지막 라운드는 항상 데드라인 데이입니다.
      </p>
    </div>
  )
}
