import { RULES, per } from '../engine/rules'

const RULEBOOK_URL = 'https://github.com/gillettef/GameHub/blob/dev/games/crease/rules/rulebook.md'

/** 3분 안에 읽는 규칙 요약. 기준은 rules/rulebook.md */
export function RulesText() {
  const t = (n: number) => per(RULES.target, n)
  return (
    <>
      <ol className="m-0 flex list-decimal flex-col gap-2.5 pl-5 text-muted [&_b]:text-text">
        <li>
          <b>목표</b> · 별빛 조각을 주워 내 닻 칸(색 테두리)으로 가져오면 1점. 목표 점수(2인 {t(2)} · 3인 {t(3)} · 4인 {t(4)})에 닿으면 그
          라운드를 마치고 끝.
        </li>
        <li>
          <b>내 차례</b> · 최대 {RULES.moveSteps}걸음 이동 + 접기나 펼치기 1번. 접기는 걸음 사이 언제든 끼워 넣을 수 있다.
        </li>
        <li>
          <b>접기</b> · 보드 왼쪽이나 오른쪽 끝을 1~3열 접어 넘긴다. 양쪽 폭의 합은 4까지.
        </li>
        <li>
          <b>이음</b> · 접으면 맨 끝 열이 안쪽 열 바로 옆에 붙는다(금색 선). 왼쪽 3열을 접으면 A열과 G열이 이웃!
        </li>
        <li>
          <b>부재</b> · 날개 아래 깔린 말과 조각은 잠시 사라진다(누운 말, 회색 조각). 부재인 말은 못 움직이니 내 차례에 펼쳐서 빠져나온다.
        </li>
        <li>
          <b>별똥별</b> · 차례가 끝날 때마다 새 조각이 떨어진다. 가려진 칸에 떨어지면 그 날개가 펼쳐진다(날개 터뜨리기).
        </li>
        <li>
          <b>들고 다니기</b> · 조각은 {RULES.carryLimit}개까지. 지나가기만 해도 줍고, 닻 칸에 들어가면 모두 득점.
        </li>
        <li>
          <b>동점</b> · 동점인 사람끼리 한 라운드 더.
        </li>
      </ol>
      <p className="mt-3 mb-1">
        <a className="inline-flex min-h-11 items-center text-primary" href={RULEBOOK_URL} target="_blank" rel="noopener noreferrer">
          전체 룰북 보기 ›
        </a>
      </p>
    </>
  )
}
