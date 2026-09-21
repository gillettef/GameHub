// 구단 엠블럼: 방패 + 이름 첫 글자. 참가자는 자리 색, 상대 팀은 회색(color 생략). 그림 에셋이 없어 글자 엠블럼으로 대신한다
export function Crest({ name, color, size = 28 }: { name: string; color?: string; size?: number }) {
  return (
    <span className={`crest${color ? '' : ' neutral'}`} style={{ '--crest': color, width: size, height: Math.round(size * 1.14), fontSize: Math.round(size * 0.46) } as React.CSSProperties} aria-hidden="true">
      <svg viewBox="0 0 24 28" focusable="false">
        <path d="M12 1.2 22.4 4.2v9.6c0 6.6-4.6 10.6-10.4 13C6.2 24.4 1.6 20.4 1.6 13.8V4.2z" />
      </svg>
      <b>{name.trim().charAt(0)}</b>
    </span>
  );
}
