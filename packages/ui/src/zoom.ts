/** 보드 확대·이동 계산. 좌표는 영역 가운데가 원점이고, 화면점 = 내용점 × scale + (x, y) */
export interface View {
  scale: number
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export const FIT: View = { scale: 1, x: 0, y: 0 }

/** 배율은 1~max, 이동은 내용이 영역 밖으로 비지 않는 범위 */
export function clampView(view: View, size: Size, max: number): View {
  const scale = Math.min(max, Math.max(1, view.scale))
  const limitX = (size.width * (scale - 1)) / 2
  const limitY = (size.height * (scale - 1)) / 2
  const clamp = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v)) || 0
  return { scale, x: clamp(view.x, limitX), y: clamp(view.y, limitY) }
}

/** 점 at 아래의 내용이 그대로 있도록 배율을 바꾸고, 손가락이 움직인 만큼(move) 옮긴다 */
export function zoomAt(view: View, at: { x: number; y: number }, factor: number, move: { x: number; y: number }, size: Size, max: number): View {
  const scale = Math.min(max, Math.max(1, view.scale * factor))
  const k = scale / view.scale
  return clampView({ scale, x: at.x - (at.x - view.x) * k + move.x, y: at.y - (at.y - view.y) * k + move.y }, size, max)
}
