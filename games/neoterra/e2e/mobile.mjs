// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/neoterra/)에서 열어 모드를 끝까지 둔다.
// 한 기기(나 + AI: 퀘스트 고르기 → 결정 → 연구·차례 종료, 메뉴), AI끼리 끝까지(결과판 → 다시 하기·처음으로, 이어 하기),
// 돌려 하기 가림막(사람 둘), 온라인(두 기기: 대기실 → 시작 → 차례 진행, 새로고침 복귀, 관전).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 등장·전환 연출 중간이 찍히지 않게 움직임을 줄인다(motion.css 의 prefers-reduced-motion)
const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }

/** AI 를 빠르게, 첫 판 안내는 켠 채로 */
async function fastAI(page, speed = 'instant') {
  await page.evaluate((s) => localStorage.setItem('neoterra:v1:settings', JSON.stringify({ aiSpeed: s, turnSummary: true, coach: true })), speed)
  await page.reload()
}

const footer = (page) => page.locator('footer')

/** 떠 있는 요약·확인 창을 닫는다(시대 요약, 지난 차례 이후, 결정 확인 등) */
async function closeNotices(page) {
  for (let i = 0; i < 10; i++) {
    const ok = page.getByRole('dialog').getByRole('button', { name: '확인', exact: true })
    if (!(await ok.first().isVisible().catch(() => false))) return
    await ok.first().click()
  }
}

/** 내게 온 결정 창(퀘스트 보상·유도·공존·주둔지)이 있으면 첫 선택지를 고른다 */
async function answerPending(page) {
  const box = page.locator('[aria-labelledby="nt-pending-title"]')
  if (!(await box.isVisible().catch(() => false))) return false
  await box.locator('button').first().click()
  return true
}

/** 조건이 될 때까지 창을 닫고 결정에 답하며 기다린다 */
async function until(page, locator, timeout = 60_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await locator.first().isVisible().catch(() => false)) return
    await closeNotices(page)
    await answerPending(page)
    await page.waitForTimeout(150)
  }
  await page.screenshot({ path: path.join(dir, 'shots', 'fail.png') })
  throw new Error(`기다린 화면이 나오지 않았습니다: ${locator}`)
}

/** 요약 창·결정이 끼어들어도 누른다: 닫고 다시 시도 */
async function tap(page, locator) {
  for (let i = 0; i < 40; i++) {
    await closeNotices(page)
    await answerPending(page)
    try {
      await locator.first().click({ timeout: 1500 })
      return
    } catch {
      // 창이 떠 있거나 아직 없다
    }
  }
  await page.screenshot({ path: path.join(dir, 'shots', 'fail.png') })
  throw new Error(`누를 수 없습니다: ${locator}`)
}

/** 내 차례의 퀘스트를 고른다: ⑤「퀘스트 고르기」→ 칸 1 → 시트의 고르기 */
async function pickQuest(page) {
  await until(page, footer(page).getByRole('button', { name: '퀘스트 고르기' }))
  await tap(page, footer(page).getByRole('button', { name: '퀘스트 고르기' }))
  await tap(page, page.locator('#quest-track button').first())
  await tap(page, page.getByRole('dialog').getByRole('button', { name: /고르기$/ }))
}

await withGame(dir, async ({ url, open, shot }) => {
  // ── 한 기기: 나 + AI 1 ──
  const solo = await open(PHONE)
  await fastAI(solo, 'fast')
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await solo.getByTestId('table').waitFor()
  await pickQuest(solo)
  await until(solo, footer(solo).getByRole('button', { name: '차례 종료' }))
  await shot(solo, '02-table')
  // 내 보드의 테크 웹: 노드를 누르면 상세 시트
  await tap(solo, solo.getByRole('button', { name: '메뉴' }))
  await shot(solo, '03-menu')
  await solo.getByRole('button', { name: '게임 설명' }).click()
  await shot(solo, '04-rules')
  await solo.getByRole('button', { name: '닫기' }).last().click()
  await tap(solo, footer(solo).getByRole('button', { name: '차례 종료' }))
  // 지휘가 남아 있으면 한 번 묻는다
  const endSheet = solo.getByRole('dialog').getByRole('button', { name: '차례 종료' })
  if (await endSheet.isVisible().catch(() => false)) {
    await shot(solo, '05-end-confirm')
    await endSheet.click()
  }
  await until(solo, footer(solo).getByRole('button', { name: '퀘스트 고르기' }))
  await shot(solo, '06-next-turn')
  // 처음 화면으로 나갔다가 이어 하기
  await tap(solo, solo.getByRole('button', { name: '메뉴' }))
  await solo.getByRole('button', { name: /처음 화면으로/ }).click()
  await solo.getByRole('button', { name: /^이어 하기/ }).click()
  await until(solo, footer(solo).getByRole('button', { name: '퀘스트 고르기' }))

  // ── AI끼리 끝까지(관전하듯): 4인 모두 AI ──
  const watch = await open(PHONE)
  await fastAI(watch)
  await watch.getByRole('button', { name: '4명' }).click()
  await watch.getByRole('button', { name: '사람', exact: true }).first().click()
  await watch.getByRole('button', { name: '시작', exact: true }).click()
  await watch.getByTestId('table').waitFor()
  await watch.waitForTimeout(1500)
  await shot(watch, '07-bots')
  await until(watch, footer(watch).getByRole('button', { name: '결과 보기' }), 300_000)
  await tap(watch, footer(watch).getByRole('button', { name: '결과 보기' }))
  await watch.getByRole('dialog', { name: '최종 점수' }).waitFor()
  await shot(watch, '08-result')
  await watch.getByRole('button', { name: '같은 설정으로 다시 하기' }).click()
  await watch.getByTestId('table').waitFor()

  // ── 돌려 하기: 사람 둘 ──
  const pass = await open(PHONE)
  await fastAI(pass)
  await pass.getByRole('button', { name: '봇', exact: true }).first().click()
  await pass.getByLabel('2번 자리 이름').fill('나래')
  await pass.getByRole('button', { name: '시작', exact: true }).click()
  await pass.getByRole('button', { name: / 화면 보기$/ }).waitFor()
  await shot(pass, '09-pass-curtain')
  await pass.getByRole('button', { name: / 화면 보기$/ }).click()
  await pickQuest(pass)

  // ── 온라인: 두 기기 ──
  const host = await open(BROWSER)
  await host.getByRole('button', { name: '온라인' }).click()
  await host.getByLabel('닉네임').fill('가람')
  await host.getByRole('button', { name: '방 만들기' }).click()
  const code = (await host.getByTestId('room-code').innerText()).trim()
  assert.match(code, /^[A-Z2-9]{4}$/)
  const guest = await open(PHONE)
  await guest.goto(`${url}?room=${code}`)
  await guest.getByLabel('닉네임').fill('나래')
  await guest.getByRole('button', { name: '참가' }).click()
  await host.getByText('나래').waitFor()
  await shot(host, '10-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await host.getByTestId('table').waitFor()
  await guest.getByTestId('table').waitFor()
  // 먼저 둘 사람이 퀘스트를 고르고 차례를 끝낸다
  const first = (await host.getByRole('button', { name: '퀘스트 고르기' }).isVisible().catch(() => false)) ? host : guest
  const second = first === host ? guest : host
  await pickQuest(first)
  await until(first, footer(first).getByRole('button', { name: '차례 종료' }))
  await shot(second, '11-online-wait')
  await tap(first, footer(first).getByRole('button', { name: '차례 종료' }))
  const endOnline = first.getByRole('dialog').getByRole('button', { name: '차례 종료' })
  if (await endOnline.isVisible().catch(() => false)) await endOnline.click()
  await until(second, footer(second).getByRole('button', { name: '퀘스트 고르기' }))
  // 새로고침해도 같은 자리로 돌아온다
  await second.reload()
  await second.getByTestId('table').waitFor()
  await until(second, footer(second).getByRole('button', { name: '퀘스트 고르기' }))
  await shot(second, '12-online-resumed')
  await pickQuest(second)

  // 관전: 같은 방을 좌석 없이 본다
  const viewer = await open(PHONE)
  await viewer.goto(`${url}?room=${code}`)
  await viewer.getByRole('button', { name: '관전' }).click()
  await viewer.getByTestId('table').waitFor()
  await shot(viewer, '13-spectate')
})
console.log('모바일 확인 통과')
