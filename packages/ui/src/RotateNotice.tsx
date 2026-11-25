/** 가로 화면은 지원하지 않는다(휴대폰에서만 보인다, theme.css .gh-rotate) */
export function RotateNotice() {
  return (
    <div className="gh-rotate fixed inset-0 z-50 items-center justify-center bg-bg p-6 text-center text-lg font-bold">
      세로로 돌려 주세요
    </div>
  )
}
