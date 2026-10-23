/** 회전하는 테서랙트(정육면체 안의 정육면체) 로고. CSS 3D만 쓴다 */
const FACES = ['rotateY(0deg)', 'rotateY(90deg)', 'rotateY(180deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)']

function Cube({ size, className, color }: { size: number; className: string; color: string }) {
  return (
    <div className={`preserve-3d absolute top-1/2 left-1/2 ${className}`} style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}>
      {FACES.map((t) => (
        <div
          key={t}
          className="absolute inset-0 rounded-md"
          style={{
            transform: `${t} translateZ(${size / 2}px)`,
            border: `2px solid ${color}`,
            background: `${color}14`,
            boxShadow: `0 0 18px ${color}55, inset 0 0 14px ${color}33`,
          }}
        />
      ))}
    </div>
  )
}

export function TesseractLogo({ size = 140 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size, perspective: size * 4 }} aria-hidden="true">
      <span className="absolute inset-[15%] rounded-full bg-accent/30 blur-2xl" />
      <Cube size={size * 0.62} className="animate-spin-slow" color="#9b8cff" />
      <Cube size={size * 0.32} className="animate-spin-rev" color="#5ad1e6" />
    </div>
  )
}
