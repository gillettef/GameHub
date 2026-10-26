import { GlyphText, Hourglass } from './DieFace'
import { Button, Sheet } from './primitives'
import { resetTips } from './tips'
import { Icon } from './icons'

/** 규칙 요약 (docs/rule.md v0.7에서 옮김). 처음 하는 친구에게 보여 주는 용도 */
const SECTIONS = [
  {
    n: 1,
    name: '선',
    body: '한 턴에 1개씩 5턴. 첫 주사위는 가운데, 그다음은 선의 왼쪽·오른쪽 끝에만 붙여요.',
    score: '가장 긴 같은 색 가로 연속 → 칸 수만큼 (라운드 끝에 확정)',
  },
  {
    n: 2,
    name: '평면',
    body: '한 턴에 2개씩 3턴. 선 뒤쪽 10칸 중 이미 놓인 주사위와 맞닿은 빈 칸에 놓아요. 최소 4칸은 비어요.',
    score: '선을 포함해 가장 넓게 이어진 같은 색 영역 → 크기만큼 (라운드 끝에 확정)',
  },
  {
    n: 3,
    name: '입체',
    body: '한 턴에 3개씩 2턴. 기둥 꼭대기에 아래보다 큰 숫자만 쌓아요. ⧗은 어디든 올릴 수 있지만 ⧗ 위에는 못 쌓아요. 못 놓으면 잔해(−1점).',
    score: '한 기둥 안에서 가장 높게 이어진 같은 색 세로 연속 → 주사위 수만큼 (라운드 끝에 확정)',
  },
  {
    n: 4,
    name: '시간',
    body: '선부터 번갈아 내 ⧗ 꼭대기 주사위 1개를 앞·뒤·왼·오른 옆 칸으로 한 칸 넘겨요. 기둥 위로 갈 땐 쌓기 규칙을 따르고, 빈 칸이면 1층이 돼요. 넘길 수 없는 주사위를 고르면 잔해가 돼요.',
    score: '기본 점수 없음. 넘긴 결과는 개인 목표 판정에 쓰여요',
  },
]

/** 처음 보는 낱말 풀이 */
const GLOSSARY: [string, string][] = [
  ['시장', '가운데에 굴려 둔 주사위 묶음들. 차례마다 칸 하나를 통째로 가져와요.'],
  ['윗면 · 앞면', '윗면은 위를 보는 면(시장이 정함), 앞면은 선(보드 아래쪽)을 보는 면(놓을 때 고름).'],
  ['주사위의 색', '숫자 면마다 색이 달라요(주사위마다 짝이 다름). 주사위의 색은 윗면의 색이고, ⧗ 면은 색이 없어 같은 색 연결을 끊어요.'],
  ['다시 굴리기', '가져온 주사위 1개를 턴마다 한 번 다시 굴릴 수 있어요. 대신 주머니에서 주사위 1개를 꺼내 내 잔해로 둬요(−1점).'],
  ['⧗ (시간)', '숫자 대신 모래시계가 있는 면. 3라운드에는 어디든 올릴 수 있지만 그 위엔 못 쌓고, 4라운드에 넘겨요.'],
  ['잔해', '놓을 수 없거나 넘길 수 없어 버린 주사위. 1개당 −1점.'],
  ['선착 · 달성', '라운드 목표를 가장 먼저 이루면 선착 4점, 그 뒤에 이루면 달성 2점.'],
]

export function RulesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="규칙 한눈에" onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">
        빅뱅으로 부서져 흩어진 테서랙트의 조각(주사위)을 모아 다시 짜 맞춰요. 4라운드 동안 <b className="text-fg">선 → 평면 → 입체 → 시간</b>을 차례로
        복원해 점수가 가장 높은 사람이 이겨요.
      </p>
      <div className="rounded-2xl bg-raised/60 p-3 text-sm leading-relaxed ring-1 ring-line ring-inset">
        <b>턴:</b> 시장에서 칸 하나(주사위 묶음)를 통째로 가져와 모두 놓아요. 시장 주사위는 굴려진 그대로 놓고, <b>앞면</b>만 고를 수 있어요. 잔해 1개를 내고 1개를 <b>다시 굴릴</b> 수도 있어요.
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
      <section className="rounded-2xl bg-raised/60 p-4 ring-1 ring-line ring-inset">
        <h3 className="font-bold">낱말 풀이</h3>
        <dl className="mt-2 flex flex-col gap-2 text-sm leading-relaxed">
          {GLOSSARY.map(([term, text]) => (
            <div key={term}>
              <dt className="font-bold text-accent">
                <GlyphText text={term} />
              </dt>
              <dd className="text-muted">
                <GlyphText text={text} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <Button variant="ghost" onClick={resetTips}>
        <Icon name="spark" size={16} /> 게임 중 도움말 처음부터 다시 보기
      </Button>
    </Sheet>
  )
}
