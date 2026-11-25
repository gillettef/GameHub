// 화면 테마(자동·밝게·어둡게). 라이트는 크라프트지, 다크는 개표방송 네이비(style.css 맨 위 토큰)
import { useEffect, useState } from 'react'

export type ThemePref = 'auto' | 'light' | 'dark'
export const THEME_LABEL: Record<ThemePref, string> = { auto: '자동', light: '밝게', dark: '어둡게' }

const KEY = 'election:theme'
const COLOR = { light: '#f2ede2', dark: '#0e1320' }

function load(): ThemePref {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

export function applyTheme(t: ThemePref): void {
  const el = document.documentElement
  if (t === 'auto') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', t)
  const dark = t === 'dark' || (t === 'auto' && matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? COLOR.dark : COLOR.light))
}

export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [theme, setTheme] = useState<ThemePref>(load)
  useEffect(() => {
    applyTheme(theme)
    try {
      if (theme === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, theme)
    } catch {
      // 저장할 수 없으면 이번 실행 동안만
    }
  }, [theme])
  return [theme, setTheme]
}
