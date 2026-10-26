import { useState, type CSSProperties, type PointerEvent } from 'react'
import { faceColor, facesOf, turnOrder, type DieLayout, type Face, type FaceColors, type Orientation } from '../engine'
import { colorLabel, faceLabel } from './colors'
import { DieFace } from './DieFace'

/** 위에서 비스듬히 내려다보는 기본 시점: 윗면·앞면·오른면이 보인다 */
const TILT_X = -28
const TILT_Y = -28
/** 끌어서 돌릴 때 손가락 1px당 회전 각도 */
const DRAG_DEG_PER_PX = 1.1
/** 손을 뗄 때 이만큼 넘게 돌렸으면 적어도 한 칸(90°) 돈 것으로 친다 */
const SNAP_MIN_DEG = 35
/** 이보다 덜 움직이면 끌기가 아니라 탭으로 본다 */
const TAP_PX = 6
/** 빛이 오는 방향 (옆면 그늘 계산용, 0 = 정면) */
const LIGHT = -10

interface Die3DProps {
  layout: DieLayout
  /** 숫자 면의 색 (§2 v0.7: 면마다 다름) */
  colors: FaceColors
  /** 기준 방향 (굴림 결과). 윗면은 그대로, 앞면만 front로 돌려 보인다 */
  base: Orientation
  /** 지금 앞으로 돌린 면. 없으면 base.front */
  front?: Face
  size?: number
  /**
   * 주면 마우스·손가락으로 끌어 아무 방향으로나 돌려 볼 수 있다. 손을 떼면 윗면이 다시 위로 오고
   * 정면에 가장 가까운 옆면이 앞면이 된다. steps: +1 = 왼쪽으로 한 칸(오른면이 앞으로), −1 = 오른쪽으로 한 칸
   */
  onTurn?: (steps: number) => void
  className?: string
}

/**
 * CSS 3D 정육면체 주사위. 끌면 손을 따라 돌고, 앞면을 바꾸면 윗면을 축으로 짧게(≤300ms) 돌아간다.
 * 회전 각도는 누적해서 늘 가까운 쪽으로 돈다. prefers-reduced-motion이면 전역 규칙으로 즉시 바뀐다.
 */
export function Die3D({ layout, colors, base, front, size = 56, onTurn, className = '' }: Die3DProps) {
  const order = turnOrder(layout, base)
  const k = Math.max(0, order.indexOf(front ?? base.front))
  const f = facesOf(layout, base)

  // 이전 k와 누적 각도: 3 → 0처럼 넘어갈 때도 90°만 돌게 한다
  const [spin, setSpin] = useState({ k, angle: -90 * k })
  let angle = spin.angle
  if (spin.k !== k) {
    const delta = ((k - spin.k + 6) % 4) - 2
    angle = spin.angle - 90 * delta
    setSpin({ k, angle })
  }

  const [drag, setDrag] = useState<{ x: number; y: number; id: number; dx: number; dy: number } | null>(null)
  // 좌우로 끌면 윗면 축으로 돌고(yaw), 위아래로 끌면 앞뒤로 넘어가 밑면까지 보인다(pitch)
  const dragYaw = (drag?.dx ?? 0) * DRAG_DEG_PER_PX
  const dragPitch = Math.max(-180, Math.min(180, -(drag?.dy ?? 0) * DRAG_DEG_PER_PX))

  function down(e: PointerEvent<HTMLDivElement>) {
    if (!onTurn) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, dy: 0 })
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (drag?.id !== e.pointerId) return
    setDrag({ ...drag, dx: e.clientX - drag.x, dy: e.clientY - drag.y })
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (drag?.id !== e.pointerId) return
    const dx = e.clientX - drag.x
    setDrag(null)
    if (Math.abs(dx) < TAP_PX) return
    // 돌린 각도에서 가장 가까운 90° 칸으로. 왼쪽으로 끌면(yaw 감소) 오른면이 앞으로 온다
    const deg = -dx * DRAG_DEG_PER_PX
    const steps = Math.abs(deg) < SNAP_MIN_DEG ? 0 : Math.sign(deg) * Math.max(1, Math.round(Math.abs(deg) / 90))
    if (steps === 0) return
    // 누적 각도를 직접 정해 둔다: 크게 돌렸어도 놓은 자리에서 가까운 칸으로 멈추게
    setSpin({ k: (((k + steps) % 4) + 4) % 4, angle: spin.angle - 90 * steps })
    onTurn?.(steps)
  }

  const half = size / 2
  const yaw = angle + TILT_Y + dragYaw
  // 옆면 그늘: 왼쪽 앞에서 빛이 온다고 보고, 지금 각도에서 빛을 등질수록 어둡게
  const sideShade = (spinDeg: number) => 0.06 + 0.3 * ((1 - Math.cos(((yaw + spinDeg + LIGHT) * Math.PI) / 180)) / 2)
  const faces: { face: Face; transform: string; shade: number }[] = [
    { face: f.front, transform: `translateZ(${half}px)`, shade: sideShade(0) },
    { face: f.right, transform: `rotateY(90deg) translateZ(${half}px)`, shade: sideShade(90) },
    { face: f.back, transform: `rotateY(180deg) translateZ(${half}px)`, shade: sideShade(180) },
    { face: f.left, transform: `rotateY(-90deg) translateZ(${half}px)`, shade: sideShade(-90) },
    { face: f.top, transform: `rotateX(90deg) translateZ(${half}px)`, shade: 0 },
    { face: f.bottom, transform: `rotateX(-90deg) translateZ(${half}px)`, shade: 0.5 },
  ]
  const cube: CSSProperties = {
    width: size,
    height: size,
    transform: `rotateX(${TILT_X + dragPitch}deg) rotateY(${yaw}deg)`,
    transition: drag ? 'none' : 'transform 260ms cubic-bezier(0.3, 1.25, 0.5, 1)',
  }
  const shownFront = order[k] ?? base.front

  return (
    <div
      role="img"
      aria-label={`${colorLabel(faceColor(colors, base.top))} 주사위, 윗면 ${faceLabel(base.top)}, 앞면 ${faceLabel(shownFront)}`}
      className={`relative shrink-0 ${onTurn ? 'cursor-grab touch-none select-none active:cursor-grabbing' : ''} ${className}`}
      // 정육면체는 기울어져 있어 실제 크기보다 조금 크게 보인다
      style={{ width: size * 1.45, height: size * 1.45, perspective: size * 9 }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {/* 바닥 그림자 */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/45 blur-md"
        style={{ bottom: size * 0.02, width: size * 0.95, height: size * 0.22 }}
      />
      <div className="preserve-3d absolute top-1/2 left-1/2" style={{ ...cube, margin: `-${half}px 0 0 -${half}px` }}>
        {faces.map(({ face, transform, shade }, i) => (
          <span key={i} className="absolute inset-0 backface-hidden" style={{ transform }}>
            <DieFace face={face} color={faceColor(colors, face)} size={size} bare />
            {shade > 0 && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-[12%] bg-black"
                style={{ opacity: shade, transition: cube.transition === 'none' ? 'none' : 'opacity 260ms ease-out' }}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
