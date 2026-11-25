// 규칙 요약(옛 화면의 "규칙 요약"과 같은 내용, 룰북 v0.3.1 기준)과 규칙 타일 목록
import { TILES } from '../engine/data'

export function RulesText() {
  return (
    <div className="pm-rules text-sm">
      <p className="mt-0">
        각 플레이어는 <b>조종사</b>(내 로봇의 주인)이면서 <b>설계자</b>(오른쪽 플레이어 로봇의 두뇌를 짜는 사람)입니다. 8라운드 뒤 점수가 가장 높은 사람이
        이깁니다. <b>코어 1개 = 2점</b>, <b>설계자 점수 1개 = 1점</b>. 같으면 코어가 많은 사람이 앞섭니다.
      </p>
      <h3>라운드</h3>
      <ol>
        <li>
          <b>충전</b> — 에너지 +1 (최대 3). 처음엔 1개로 시작합니다.
        </li>
        <li>
          <b>설계</b> — 규칙 타일 5개를 뽑아 3개를 오른쪽 로봇의 슬롯 1·2·3에 꽂습니다. 모두 동시에 공개합니다.
        </li>
        <li>
          <b>실행</b> — 선 플레이어 로봇부터 한 대씩. 조종사는 에너지 1로 <b>개입</b>(회전·차단·추진) 1회를 할 수 있고, 로봇은 슬롯 1부터 검사해{' '}
          <b>처음 참인 규칙 하나</b>를 실행합니다. 없으면 1칸 전진.
        </li>
        <li>
          <b>정리</b> — 타일을 주머니로. 코어가 2개 이하면 빈 생성 지점에 보충. 선 플레이어는 왼쪽으로.
        </li>
      </ol>
      <h3>설계자 점수</h3>
      <ul>
        <li>
          로봇이 규칙(또는 기본 행동) 때문에 막힌 칸에 <b>충돌</b>하면 그 로봇의 설계자 +1.
        </li>
        <li>
          조종사가 개입에 쓴 에너지는 두뇌 보드에 쌓이고, <b>2개마다</b> 설계자 +1.
        </li>
      </ul>
      <h3>판정</h3>
      <ul>
        <li>
          <b>막힌 칸</b>: 아레나 밖, 기둥, 다른 로봇. 코어가 있는 칸은 비어 있습니다.
        </li>
        <li>
          <b>앞줄</b>: 앞 칸부터 곧게. 기둥 앞·아레나 끝에서 끊기고, 처음 만난 로봇 칸까지 포함. 보드에 실행 중인 로봇의 앞줄을 옅게 칠합니다.
        </li>
        <li>
          <b>멈출 때까지 전진</b>: 막힌 칸 앞에서 멈추며 충돌이 아닙니다(처음부터 막혔으면 충돌).
        </li>
        <li>충돌하면 그 타일의 남은 행동은 취소. 이동 중 지나간 칸의 코어도 얻습니다.</li>
      </ul>
      <h3>보드</h3>
      <ul>
        <li>빗금 칸은 기둥, 점선 원은 코어 생성 지점, 노란 마름모는 코어, 진한 테두리 칸은 가장자리입니다.</li>
        <li>화살표가 로봇이 바라보는 방향입니다. 밝은 고리는 실행 중인 로봇, 점선 고리는 내가 설계하는 로봇입니다.</li>
      </ul>
    </div>
  )
}

export function TileList() {
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {TILES.map((t) => (
          <tr key={t.code} className="border-b border-line">
            <td className="py-1.5 pr-2 text-muted">{t.code}</td>
            <td className="py-1.5">{t.text}</td>
            <td className="py-1.5 pl-2 text-right text-muted">×{t.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
