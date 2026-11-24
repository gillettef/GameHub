/**
 * Android 뒤로가기·브라우저 뒤로 처리.
 *
 * 화면 전환이 history를 쓰지 않으므로, 처리할 곳(시트, 모달, 홈이 아닌 화면)이 있는 동안
 * 가짜 history 항목(가드) 하나를 쌓아 둔다. 뒤로가기가 가드를 꺼내면 가장 나중에 등록된 처리를 부르고,
 * 아직 처리할 곳이 남아 있으면 가드를 다시 쌓는다. UI로 닫을 때는 history를 건드리지 않는다
 * (남은 가드는 다음 뒤로가기에서 조용히 사라진다).
 */
import { useEffect, useRef } from 'react'

const stack: { fn: () => void }[] = []
let guarded = false

function ensureGuard(): void {
  if (guarded || typeof window === 'undefined') return
  window.history.pushState({ tesseractGuard: true }, '')
  guarded = true
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    guarded = false
    const top = stack.at(-1)
    if (!top) return
    top.fn()
    // 처리한 쪽이 닫히는 것은 다음 렌더이므로, 렌더가 끝난 뒤에도 처리할 곳이 남아 있으면 가드를 다시 쌓는다
    window.setTimeout(() => {
      if (stack.length > 0) ensureGuard()
    }, 50)
  })
}

/** 켜져 있는 동안 뒤로가기를 누르면 onBack을 부른다. 나중에 켜진 것이 먼저 받는다 */
export function useBack(onBack: () => void, active = true): void {
  const ref = useRef(onBack)
  useEffect(() => {
    ref.current = onBack
  }, [onBack])
  useEffect(() => {
    if (!active) return
    const entry = { fn: () => ref.current() }
    stack.push(entry)
    ensureGuard()
    return () => {
      // 닫힌 뒤 가드가 남아도 다음 뒤로가기에서 조용히 사라진다
      const i = stack.indexOf(entry)
      if (i !== -1) stack.splice(i, 1)
    }
  }, [active])
}
