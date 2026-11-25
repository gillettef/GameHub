/**
 * 연출 박자: 서버(또는 한 기기 진행)는 행동 하나의 최종 상태만 보낸다. 화면은 직전 상태에 마지막 행동을 다시 적용해
 * (resolveAction, 완전 정보 게임이라 가능) 자동 내리기·차례 넘김을 박자마다 보여 준다. 옛 화면의 DELAYS.drop 과 같은 간격.
 * 버전이 하나씩 이어지지 않으면(재접속·새로고침) 연출 없이 바로 최종 상태를 보인다.
 */
import { useEffect, useState } from 'react'
import { resolveAction } from '../engine/rules'
import type { Action, GameEvent, GameState, Step } from '../engine/types'

/** 박자 사이(ms). 프로토타입 값 */
export const STEP_MS = 800
const REDUCED_STEP_MS = 250

export interface Playback {
  /** 지금 보여 줄 상태 */
  shown: GameState
  /** 아직 보여 줄 박자가 남았는가(그동안은 입력을 받지 않는다) */
  busy: boolean
  /** 방금 지지자가 놓인 권역(연출용). 없으면 -1 */
  highlight: number
  /** highlight 가 새로 생길 때마다 증가(같은 권역에 연달아 놓여도 다시 연출) */
  pulse: number
}

interface State extends Playback {
  /** 받은 최신 상태 */
  target: GameState
  frames: Step[]
}

function showFrame(st: State, frame: Step): State {
  let { highlight, pulse } = st
  for (const e of frame.events as GameEvent[]) {
    if (e.type === 'setup' || e.type === 'place' || e.type === 'drop') {
      highlight = e.hole
      pulse++
    } else if (e.type === 'pick' || e.type === 'gameOver') highlight = -1
  }
  return { ...st, shown: frame.state, highlight, pulse }
}

/** 새로 받은 상태를 박자로 펼친다. 이어지지 않으면 null */
function unfold(prev: GameState, next: GameState, last: Action | null): Step[] | null {
  if (!last || next.version !== prev.version + 1) return null
  try {
    const steps = resolveAction(prev, last)
    return JSON.stringify(steps[steps.length - 1]!.state) === JSON.stringify(next) ? steps : null
  } catch {
    return null
  }
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function usePlayback(game: GameState, last: Action | null): Playback {
  const [st, setSt] = useState<State>(() => ({ target: game, frames: [], shown: game, busy: false, highlight: -1, pulse: 0 }))

  // 받은 상태가 바뀌면(렌더 중 상태 조정) 박자를 쌓는다. 같은 version 의 새 객체(접속 표시만 바뀐 소식)는 무시한다
  if (game !== st.target && game.version !== st.target.version) {
    const steps = unfold(st.target, game, last)
    if (!steps) setSt({ ...st, target: game, frames: [], shown: game, busy: false, highlight: -1 })
    else {
      const queued = [...st.frames, ...steps]
      const next = st.frames.length ? { ...st, target: game, frames: queued } : showFrame({ ...st, target: game, frames: queued.slice(1) }, queued[0]!)
      setSt({ ...next, busy: next.frames.length > 0 })
    }
  }

  useEffect(() => {
    if (!st.frames.length) return
    const id = setTimeout(
      () =>
        setSt((s) => {
          if (!s.frames.length) return s
          const next = showFrame({ ...s, frames: s.frames.slice(1) }, s.frames[0]!)
          return { ...next, busy: next.frames.length > 0 }
        }),
      reducedMotion() ? REDUCED_STEP_MS : STEP_MS,
    )
    return () => clearTimeout(id)
  }, [st.frames])

  return { shown: st.shown, busy: st.busy, highlight: st.highlight, pulse: st.pulse }
}
