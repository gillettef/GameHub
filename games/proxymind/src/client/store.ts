/** localStorage(같은 origin 을 쓰는 다른 게임과 겹치지 않게 proxymind: 접두어) */
export const store = {
  get<T>(name: string, fallback: T): T {
    try {
      return (JSON.parse(localStorage.getItem(`proxymind:${name}`) ?? 'null') as T | null) ?? fallback
    } catch {
      return fallback
    }
  },
  set(name: string, value: unknown): void {
    try {
      if (value === null) localStorage.removeItem(`proxymind:${name}`)
      else localStorage.setItem(`proxymind:${name}`, JSON.stringify(value))
    } catch {
      /* 사생활 보호 모드 */
    }
  },
}
