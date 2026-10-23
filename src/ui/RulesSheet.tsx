import { GlyphText, Hourglass } from './DieFace'
import { Sheet } from './primitives'

/** 규칙 요약 (docs/rule.md v0.6에서 옮김). 처음 하는 친구에게 보여 주는 용도 */
const SECTIONS = [
  {
    n: 1,
    name: '선',
    body: '한 턴에 1개씩 5턴. 첫 주사위는 가운데, 그다음은 선의 왼쪽·오른쪽 끝에만 붙여요.',
    score: '같은 색 연속 2/3/4/5칸 → 1/3/6/10점 · 윗면이 1씩 오르거나 내리는 연속 3칸 이상 → 칸 수만큼',
  },
  {
    n: 2,
    name: '평면',
    body: '한 턴에 2개씩 3턴. 선 뒤쪽 10칸 중 이미 놓인 주사위와 맞닿은 빈 칸에 놓아요. 최소 4칸은 비어요.',
    score: '같은 색으로 이어진 크기 3 이상 영역 → 크기만큼 · 맞닿은 윗면이 1 차이 → 쌍마다 1점 (라운드 끝에 확정)',
  },
  {
    n: 3,
    name: '입체',
    body: '한 턴에 3개씩 2턴. 기둥 꼭대기에 아래보다 큰 숫자만 쌓아요. ⧗은 어디든 올릴 수 있지만 ⧗ 위에는 못 쌓아요. 못 놓으면 잔해(−1점).',
    score: '3/4/5/6층 기둥 → 3/6/10/15점 · 맨 앞줄 꼭대기 앞면이 1씩 오르내리는 연속 3칸 이상 → 칸 수 × 2',
  },
  {
    n: 4,
    name: '시간',
    body: '선부터 번갈아 내 ⧗ 꼭대기 주사위 1개를 앞·뒤·왼·오른 옆 칸으로 한 칸 굴려요. 기둥 위로 갈 땐 쌓기 규칙을 따르고, 빈 칸이면 1층이 돼요. 굴릴 수 없는 주사위를 고르면 잔해가 돼요.',
    score: '굴린 결과로 바뀐 선과 탑이 최종 점수가 돼요',
  },
]

export function RulesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="규칙 한눈에" onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">
        각자 자기만의 작은 우주를 설계해요. 4라운드 동안 같은 주사위로 <b className="text-fg">선 → 평면 → 입체 → 시간</b>을 쌓아 점수가 가장 높은 사람이
        이겨요.
      </p>
      <div className="rounded-2xl bg-raised/60 p-3 text-sm leading-relaxed ring-1 ring-line ring-inset">
        <b>턴:</b> 시장에서 칸 하나(주사위 묶음)를 통째로 가져와 모두 놓아요. 시장 주사위는 굴려진 그대로 놓고, <b>앞면</b>만 고를 수 있어요.
      </div>
      {SECTIONS.map((s, i) => (
        <article key={s.n} className="animate-rise rounded-2xl bg-raised/60 p-4 ring-1 ring-line ring-inset" style={{ animationDelay: `${i * 60}ms` }}>
          <h3 className="flex items-center gap-2 font-bold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent font-display text-sm text-void">{s.n}</span>
            {s.name}의 세계
            {s.n === 4 && <Hourglass size={16} color="#f2a65a" />}
          </h3>
          <p className="mt-2 text-sm leading-relaxed">
            <GlyphText text={s.body} />
          </p>
          <p className="mt-2 text-xs leading-relaxed text-goal">{s.score}</p>
        </article>
      ))}
      <div className="rounded-2xl bg-raised/60 p-3 text-sm leading-relaxed ring-1 ring-line ring-inset">
        <b className="text-goal">라운드 목표</b> 먼저 달성 4점 · 달성 2점 &nbsp;·&nbsp; <b className="text-personal">개인 목표</b> 게임 끝 달성 6점 &nbsp;·&nbsp;{' '}
        <b className="text-law">우주 법칙</b> 게임마다 1장 &nbsp;·&nbsp; <b className="text-danger">잔해</b> 1개당 −1점
        <br />
        동점이면 잔해가 적은 사람, 그다음 가장 높은 기둥을 가진 사람이 이겨요.
      </div>
    </Sheet>
  )
}
