export const NAME_MAX = 12

/** 제어 문자·꺾쇠를 지우고 길이를 자른다. 비면 fallback */
export function cleanName(raw: unknown, fallback: string): string {
  const text = String(raw ?? '')
    .replace(/[\p{Cc}<>]/gu, '')
    .trim()
  return Array.from(text).slice(0, NAME_MAX).join('') || fallback
}
