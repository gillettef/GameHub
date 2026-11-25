// 기록 목록, 규칙 요약, 지도 보는 법
import type { CSSProperties, ReactNode } from 'react'
import type { View } from '../def'
import type { Pid } from '../engine/map'
import { logText } from './log'

/** 라운드 머리를 넣은 기록(최신이 위) */
export function GameLog({ view, side, names }: { view: View; side: Pid; names: Record<Pid, string> }) {
  const items: { key: string; node: ReactNode; head?: boolean }[] = []
  let cur: number | null = null
  view.log.forEach((e, i) => {
    const node = logText(e, view.me, side, names)
    if (node === null) return
    if (e.round !== cur) {
      cur = e.round
      items.push({ key: `r${cur}`, node: `${cur}라운드`, head: true })
    }
    items.push({ key: `e${i}`, node })
  })
  if (items.length === 0) return <p className="text-muted">아직 기록이 없습니다.</p>
  return (
    <ol className="m-0 list-none p-0">
      {items.reverse().map((it) => (
        <li key={it.key} className={it.head ? 'mt-2 border-b border-line pb-1 text-xs font-bold text-muted' : 'border-b border-line py-1.5 text-sm last:border-0'}>
          {it.node}
        </li>
      ))}
    </ol>
  )
}

export function RulesText() {
  return (
    <div className="text-[15px]">
      <p className="mt-0">
        행성 9곳을 두고 다툰다. <b>확정 점령 6곳</b>을 먼저 모으거나, 10라운드 뒤 <b>마지막 빛</b>에서 더 많이 가진 쪽이 이긴다.
      </p>
      <ol className="pl-5">
        <li className="mb-1.5">
          <b>계획</b> — 함대마다 이웃 성계로 이동하거나 머문다. 직전에 떠난 성계로는 바로 돌아갈 수 없다(관성).
        </li>
        <li className="mb-1.5">
          <b>이동 처리</b> — 2라운드 전에 낸 카드가 공개되어 <b>잔상</b>이 움직인다. 상대는 잔상만 본다.
        </li>
        <li className="mb-1.5">
          <b>공격</b> — 공격한 함대가 있는 성계에 상대 실체가 있으면 교전. 전력(함대 1·2 = 2, 함대 3 = 3) 합이 큰 쪽이 이기고 진 쪽은 모항성으로 귀환. 동률이면 공격받은 쪽이 귀환.
          공격한 함대는 그 라운드에 점령·위장·봉쇄할 수 없고, 빗나가면 위치만 드러난다.
        </li>
        <li className="mb-1.5">
          <b>파문 진행</b> — 파문 컨베이어 카드가 한 칸씩 나아가 1번 칸에서 나가면 <b>도달</b>, 점령이 확정된다. 도달하는 행성에 내 실체가 있으면 상대 점령을{' '}
          <b>봉쇄</b>할 수 있다(공격한 함대는 불가). 봉쇄하면 내 함대 위치가 드러난다.
        </li>
        <li className="mb-1.5">
          <b>점령</b> — 행성에 있는 함대(공격·귀환하지 않은)는 그 행성의 파문 거리 칸에 카드를 놓는다. 위장 카드(3·4·5번 칸)로 속일 수 있다. 나중에 도달한 점령이 덮어쓰고, 같은
          라운드에 함께 도달하면 중립이 된다.
        </li>
      </ol>
      <p className="text-sm text-muted">
        행성의 숫자 배지 = 파문 거리, 보라색 배지는 성운(파문 거리 +1). 마지막 빛에서는 가능한 봉쇄를 모두 자동으로 한다. 룰북 v0.7 단순판 기준. 정직성 확인은 컴퓨터가 대신한다.
      </p>
    </div>
  )
}

export function Legend({ names, side }: { names: Record<Pid, string>; side: Pid }) {
  const opp: Pid = side === 'A' ? 'B' : 'A'
  const dot = (style: CSSProperties) => <span className="inline-block size-4 shrink-0 rounded-full" style={style} />
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1.5 p-0 text-sm">
      <li className="flex items-center gap-2">
        {dot({ background: 'var(--lc-me)' })}
        {names[side]} 실체
      </li>
      <li className="flex items-center gap-2">
        {dot({ border: '2px dashed var(--lc-me)' })}
        {names[side]} 잔상
      </li>
      <li className="flex items-center gap-2">
        {dot({ background: 'var(--lc-opp)' })}
        {names[opp]} 실체
      </li>
      <li className="flex items-center gap-2">
        {dot({ background: 'rgba(255,154,77,.22)', border: '2px solid var(--lc-opp)' })}
        {names[opp]} 잔상
      </li>
      <li className="flex items-center gap-2">
        {dot({ background: 'var(--lc-planet)' })}
        숫자 = 파문 거리
      </li>
      <li className="flex items-center gap-2">
        {dot({ background: 'var(--lc-nebula)' })}
        성운(+1)
      </li>
    </ul>
  )
}
