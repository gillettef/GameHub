import type { ReactNode } from 'react';

export interface TabDef<K extends string> {
  key: K;
  label: ReactNode;
  badge?: ReactNode; // 오른쪽 작은 숫자 (선수 수, 시설 수 등)
}

// 패널 안 탭 줄. 보드(구단/스타디움/경기/손패)와 공용 영역(이적 시장/리그)이 쓴다
export function Tabs<K extends string>({ tabs, value, onChange, className }: { tabs: TabDef<K>[]; value: K; onChange: (key: K) => void; className?: string }) {
  return (
    <div className={`tabs${className ? ` ${className}` : ''}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === value} className={`tab${t.key === value ? ' active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
          {t.badge !== undefined && t.badge !== null && <span className="tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
