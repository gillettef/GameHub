// emblems.svg 를 mockups/*.html 의 <!--#sprite--> … <!--/sprite--> 사이에 넣는다.
// file:// 로 열어도 <use href="#..."> 가 동작하게 하려는 것(외부 SVG 참조는 file:// 에서 막힌다).
// 실행: node games/blackcrown/design/inline-sprite.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sprite = readFileSync(join(here, 'emblems.svg'), 'utf8').trim()
const dir = join(here, 'mockups')
const re = /<!--#sprite-->[\s\S]*?<!--\/sprite-->/

for (const f of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
  const p = join(dir, f)
  const src = readFileSync(p, 'utf8')
  if (!re.test(src)) continue
  writeFileSync(p, src.replace(re, `<!--#sprite-->\n${sprite}\n<!--/sprite-->`))
  console.log('sprite →', f)
}
