// 옛 화면의 선 그림(로고·엠블럼·버스). 이모지 대신 쓴다

/** 기표 도장(卜) 로고 */
export function BrandMark({ className = 'el-brand-mark' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx={20} cy={20} r={16} fill="none" stroke="currentColor" strokeWidth={3.5} />
      <path d="M20 9v22M20 19l9 4" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </svg>
  )
}

/** 처음 화면 엠블럼: 원형 유세 경로 + 6권역 지지자 + 기표 도장 */
export function HeroEmblem() {
  return (
    <svg viewBox="0 0 156 156" className="el-hero-emblem" aria-hidden="true">
      <circle cx={78} cy={78} r={60} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 5" />
      {Array.from({ length: 6 }, (_, i) => {
        const a = ((-90 + 60 * i) * Math.PI) / 180
        const x = 78 + 60 * Math.cos(a)
        const y = 78 + 60 * Math.sin(a)
        return i % 2 === 0 ? <circle key={i} cx={x} cy={y} r={11} className="el-em-b" /> : <rect key={i} x={x - 10} y={y - 10} width={20} height={20} rx={3} className="el-em-r" />
      })}
      <circle cx={78} cy={78} r={34} fill="none" strokeWidth={5} className="el-em-stamp" />
      <path d="M78 56V100M78 76L94 84" fill="none" strokeWidth={6} strokeLinecap="round" className="el-em-stamp" />
    </svg>
  )
}

/** 유세 버스(옆모습) */
export function BusGlyph() {
  return (
    <svg viewBox="0 0 36 26" aria-hidden="true">
      <rect x={2} y={3} width={32} height={16} rx={4} fill="currentColor" />
      <rect x={5} y={6} width={6} height={5} rx={1} fill="var(--hl)" />
      <rect x={13} y={6} width={6} height={5} rx={1} fill="var(--hl)" />
      <rect x={21} y={6} width={9} height={5} rx={1} fill="var(--hl)" />
      <circle cx={10} cy={21} r={3.2} fill="currentColor" stroke="var(--hl)" strokeWidth={1.6} />
      <circle cx={26} cy={21} r={3.2} fill="currentColor" stroke="var(--hl)" strokeWidth={1.6} />
    </svg>
  )
}

/** 후보 모양 단서: 파랑 원 / 빨강 네모 (색만으로 구분하지 않는다) */
export function Mark({ p }: { p: 0 | 1 }) {
  return <span className={`el-mark el-m${p}`} aria-hidden="true" />
}
