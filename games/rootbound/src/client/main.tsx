import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { unlockAudio } from './lib/cues'
import '@gamehub/ui/theme.css'
import './styles/tokens.css'
import './styles/global.css'

// 브라우저는 사용자 입력 전에는 소리를 막는다. 첫 탭·키 입력에서 오디오를 깨운다
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, unlockAudio, { once: true, capture: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
