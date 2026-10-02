import { useMemo, useState } from 'react';
import { SLOT_SPECS } from './assets';
import { Icon, ICON_NAMES } from './Icon';
import { Slot, useSlotImage } from './Slot';

function Row({ k, label, size, note }: { k: string; label: string; size: string; note?: string }) {
  const url = useSlotImage(k);
  return (
    <div className="as-row">
      <Slot slot={k} className="as-thumb" tint="#4b3fa8" fallback={<Icon name="plus" size={18} />} />
      <div className="as-info">
        <b>{label}</b>
        <code>public/images/{k}.webp</code>
        <small>
          {size}
          {note ? ` · ${note}` : ''}
        </small>
      </div>
      <span className={`as-state ${url ? 'ok' : ''}`}>{url ? '적용됨' : '비어있음'}</span>
    </div>
  );
}

/** `#assets` 로 접근하는 이미지 슬롯 점검 화면 (개발용) */
export function AssetSheet() {
  const groups = useMemo(() => {
    const m = new Map<string, typeof SLOT_SPECS>();
    for (const s of SLOT_SPECS) m.set(s.group, [...(m.get(s.group) ?? []), s]);
    return [...m.entries()];
  }, []);
  const [showIcons, setShowIcons] = useState(false);
  return (
    <div className="assets">
      <header>
        <h1>이미지 슬롯 ({SLOT_SPECS.length})</h1>
        <p>
          파일을 <code>public/images/&lt;슬롯키&gt;.webp|png|jpg</code> 로 넣으면 자동 적용돼요. 새로고침하면 반영됩니다.
        </p>
        <div className="row">
          <a className="btn ghost small" href="#">
            게임으로
          </a>
          <button className="btn ghost small" onClick={() => setShowIcons((v) => !v)}>
            커스텀 아이콘 {showIcons ? '숨기기' : '보기'}
          </button>
        </div>
      </header>
      {showIcons && (
        <div className="icon-grid">
          {ICON_NAMES.map((n) => (
            <div key={n}>
              <Icon name={n} size={26} />
              <small>{n}</small>
            </div>
          ))}
        </div>
      )}
      {groups.map(([g, list]) => (
        <section key={g}>
          <h2>{g}</h2>
          {list.map((s) => (
            <Row key={s.key} k={s.key} label={s.label} size={s.size} note={s.note} />
          ))}
        </section>
      ))}
    </div>
  );
}
