import { copyFileSync, existsSync } from 'node:fs'
import { defineGameConfig } from '@gamehub/config/vite'

// 제출용 규칙서(submission/, build_rulebook.py 가 만든다)를 dist/rules.html 로 함께 낸다
const RULEBOOK = 'submission/LASTGRAIN_규칙서.html'

export default defineGameConfig({
  plugins: [
    {
      name: 'lastgrain-rulebook',
      apply: 'build',
      closeBundle() {
        if (existsSync(RULEBOOK)) copyFileSync(RULEBOOK, 'dist/rules.html')
      },
    },
  ],
})
