import type { ReactNode } from 'react';
import { SetupDock, type SetupDockTab } from './SetupDock';
import styles from './DockShell.module.css';

interface DockShellProps {
  /** id 접두사(영문). 탭 버튼 ↔ 패널의 aria-controls/aria-labelledby 연결에 쓴다 */
  id: string;
  heroTitle: string;
  heroSubtitle?: ReactNode;
  tabs: SetupDockTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  dockLabel: string;
  children: ReactNode;
  /** 탭과 무관하게 항상 눈에 보여야 하는 액션(예: 준비 완료/게임 시작). 독 바로 위에 고정한다 */
  footer?: ReactNode;
}

/**
 * 입장·대기실(비게임 세계) 공용 레이아웃: 헤더 → 스크롤되는 탭 내용 → (선택) 고정 푸터 → 하단 독.
 * GamePage(F015 무스크롤 대시보드)와 같은 grid(auto/1fr/auto) 뼈대를 써서 독이 항상 화면
 * 맨 아래에 붙는다. LandingPage·RoomPage(온라인)·SetupPage(핫시트)가 함께 쓴다
 * (2026-09-24 사용자 지시: 입장+대기실을 하단 독 탭 UI로 통합).
 * 게임 대시보드(TabDock/GamePage.TabPanel)와 같은 tab↔tabpanel ARIA 연결을 쓴다(ui-tab-reviewer 지적).
 */
export function DockShell({ id, heroTitle, heroSubtitle, tabs, activeTab, onTabChange, dockLabel, children, footer }: DockShellProps) {
  return (
    <div className={styles.root}>
      <header className={styles.hero}>
        <h1 className={styles.title}>{heroTitle}</h1>
        {heroSubtitle && <p className={styles.lead}>{heroSubtitle}</p>}
      </header>
      <main className={styles.main} id={`${id}-panel-${activeTab}`} role="tabpanel" aria-labelledby={`${id}-tab-${activeTab}`}>
        {children}
      </main>
      {footer && <div className={styles.footer}>{footer}</div>}
      <SetupDock idPrefix={id} tabs={tabs} active={activeTab} onChange={onTabChange} label={dockLabel} />
    </div>
  );
}
