// iPhone 17 Pro 화면 확인 도구 (docs/refactor-plan.md 4절). 게임의 e2e/mobile.mjs 가 쓴다.
// 빌드 결과를 허브(inproc)로 띄우고 WebKit 으로 열어, 화면 캡처와 배치 기준 위반 검사를 한다.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { webkit } from 'playwright'

/** 안전 영역은 데스크톱 WebKit 에서 0 이므로 실기기 확인을 대신하지 않는다 */
export const IPHONE_17_PRO = {
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
}
/** Safari 주소창·도구 막대가 보일 때를 흉내 낸 낮은 화면(가안, 실기기에서 재서 고친다) */
export const IPHONE_17_PRO_BROWSER = { ...IPHONE_17_PRO, viewport: { width: 402, height: 740 } }

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * @param {string} gameDir 게임 폴더(빌드가 끝나 있어야 한다)
 * @param {(t: { url: string, open: (device?: object) => Promise<any>, shot: (page: any, name: string) => Promise<void> }) => Promise<void>} run
 */
export async function withGame(gameDir, run) {
  const { createHub } = await import(pathToFileURL(path.resolve(here, '../../hub/server.mjs')).href)
  const dir = path.resolve(gameDir)
  const slug = path.basename(dir)
  const hub = await createHub({ games: [{ slug, name: slug, mode: 'inproc' }], gamesDir: path.dirname(dir), log: () => {} })
  const rt = hub.runtime.get(slug)
  if (rt.mode !== 'inproc') throw new Error(`${slug} 를 불러오지 못했습니다: ${rt.error}`)
  await new Promise((ok) => hub.server.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${hub.server.address().port}/${slug}/`
  const shots = path.join(dir, 'shots')
  mkdirSync(shots, { recursive: true })
  const browser = await webkit.launch()
  const errors = []
  try {
    await run({
      url,
      async open(device = IPHONE_17_PRO) {
        const context = await browser.newContext({ ...device, locale: 'ko-KR' })
        const page = await context.newPage()
        page.on('pageerror', (e) => errors.push(String(e)))
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
        await page.goto(url)
        await rendered(page)
        return page
      },
      async shot(page, name) {
        await rendered(page) // 빈 화면은 어떤 배치 검사도 통과해 버린다
        await settled(page)
        await page.screenshot({ path: path.join(shots, `${name}.png`) })
        let problems = await layoutProblems(page)
        // 재는 사이 새 화면(봇이 둔 뒤 뜨는 알림 등)이 등장 연출 중이었을 수 있다: 연출이 끝난 뒤 한 번 더 잰다
        if (problems.length) {
          await settled(page)
          problems = await layoutProblems(page)
        }
        if (problems.length) throw new Error(`[${name}] 화면 기준 위반:\n- ${problems.join('\n- ')}`)
        console.log(`확인: ${name}`)
      },
    })
    if (errors.length) throw new Error(`브라우저 오류:\n- ${errors.join('\n- ')}`)
  } finally {
    await browser.close()
    await hub.close()
  }
}

/** React 가 화면을 그릴 때까지 */
function rendered(page) {
  return page.waitForFunction(() => (document.querySelector('#root')?.textContent ?? '').trim().length > 0)
}

/** 끝이 있는 애니메이션(등장 연출 등)이 끝날 때까지, 길어도 3초. 반복 연출은 기다리지 않는다 */
function settled(page) {
  return page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      ),
      new Promise((ok) => setTimeout(ok, 3000)),
    ]),
  )
}

/** 가로 스크롤, 페이지 스크롤, 44pt 보다 작은 누르는 대상, 16px 보다 작은 입력 글자 */
export function layoutProblems(page) {
  return page.evaluate(() => {
    const out = []
    const root = document.scrollingElement
    if (root.scrollWidth > window.innerWidth + 1) out.push(`가로 스크롤 ${root.scrollWidth} > ${window.innerWidth}`)
    if (root.scrollHeight > window.innerHeight + 1) out.push(`페이지 세로 스크롤 ${root.scrollHeight} > ${window.innerHeight}`)
    for (const el of document.querySelectorAll('button, a[href], input, select, [role="button"]')) {
      // 보드 칸처럼 판 크기에 매인 대상은 data-compact 로 표시해 예외로 둔다
      if (el.closest('[data-compact], [inert], [hidden]')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.width < 43.5 || r.height < 43.5) {
        const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)
        out.push(`작은 대상 ${Math.round(r.width)}×${Math.round(r.height)}: ${label}`)
      }
      if (el.tagName === 'INPUT' && parseFloat(getComputedStyle(el).fontSize) < 16) out.push('입력창 글자가 16px 보다 작음')
    }
    return out
  })
}
