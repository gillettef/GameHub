import type { ReactNode } from 'react'
import { RotateNotice } from './RotateNotice'

/** 대국이 아닌 화면(처음·대기실·결과): 본문은 안에서 스크롤하고 주요 버튼은 아래에 고정한다 */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="gh-app">
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</main>
      {footer != null && <footer className="gh-bottom flex shrink-0 flex-col gap-2 border-t border-line px-4 pt-3">{footer}</footer>}
      <RotateNotice />
    </div>
  )
}

/** 허브 로비로(게임 디렉터리의 위). 루트에서 직접 열어도 루트에 머문다 */
export function LobbyLink() {
  return (
    <a href="../" className="inline-flex min-h-11 min-w-11 items-center text-sm text-muted no-underline">
      ‹ 게임 목록
    </a>
  )
}
