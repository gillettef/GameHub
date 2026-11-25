/**
 * 초대 링크 보내기. 운영이 HTTP 라 navigator.share·clipboard 가 없을 수 있어 옛 복사 방식까지 시도한다.
 * @returns 'shared' | 'copied' | 'manual'(사용자가 직접 복사해야 함)
 */
export async function shareLink(url: string, title: string): Promise<'shared' | 'copied' | 'manual'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared'
    }
  }
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url)
      return 'copied'
    }
  } catch {
    /* 아래 방식으로 */
  }
  const area = document.createElement('textarea')
  area.value = url
  area.readOnly = true
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  area.setSelectionRange(0, url.length)
  const ok = document.execCommand('copy')
  area.remove()
  return ok ? 'copied' : 'manual'
}
