/**
 * 대국 화면의 공통 배치 (docs/refactor-plan.md 5절, Board Game Arena 배치):
 * ① 상태바 ② 플레이어 패널 ③ 공용 보드 ④ 내 영역 ⑤ 행동 버튼.
 */
import type { ReactNode } from 'react'
import { RotateNotice } from './RotateNotice'

export interface GameShellProps {
  /** ① 지금 누구 차례이고 무엇을 해야 하는지 */
  status: ReactNode
  /** ① 보조 줄(라운드, 남은 수 등) */
  detail?: ReactNode
  onMenu(): void
  /** ② PlayerStrip */
  players?: ReactNode
  /** ③ 남는 높이를 모두 쓴다 */
  children: ReactNode
  /** ④ 손패·개인판. 없는 게임은 생략 */
  hand?: ReactNode
  /** ⑤ 확인·취소·패스. 비어 있어도 높이를 유지해 판이 흔들리지 않는다 */
  actions?: ReactNode
  /** 연결 끊김, 거절 이유 같은 알림 */
  notice?: ReactNode
}

export function GameShell({ status, detail, onMenu, players, children, hand, actions, notice }: GameShellProps) {
  return (
    <div className="gh-app">
      <header className="flex min-h-14 items-center gap-2 border-b border-line bg-surface pr-1 pl-4">
        <div className="min-w-0 flex-1 py-1" role="status" aria-live="polite">
          <div className="truncate text-base font-bold">{status}</div>
          {detail != null && <div className="truncate text-sm text-muted">{detail}</div>}
        </div>
        <button type="button" aria-label="메뉴" className="size-12 shrink-0 text-2xl text-muted" onClick={onMenu}>
          ≡
        </button>
      </header>
      {players}
      <main className="relative min-h-0 flex-1">
        {children}
        {notice != null && notice !== false && (
          <div role="alert" className="absolute inset-x-3 top-2 z-20 rounded-xl border border-danger bg-surface px-3 py-2 text-sm">
            {notice}
          </div>
        )}
      </main>
      {hand != null && <section className="max-h-[34%] shrink-0 overflow-y-auto border-t border-line bg-surface">{hand}</section>}
      <footer className="gh-bottom shrink-0 border-t border-line bg-surface px-3 pt-2">
        <div className="flex min-h-12 gap-2 *:flex-1">{actions}</div>
      </footer>
      <RotateNotice />
    </div>
  )
}
