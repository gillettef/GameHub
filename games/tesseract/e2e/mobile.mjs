// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/tesseract/)에서 열어 모드를 둔다.
// 한 기기(개인 목표 고르기 → 시장 가져오기 → 놓기 두 번 눌러 확정), 봇끼리 끝까지(알림 확인, 결과, 리플레이, 기록),
// 온라인(두 기기, 개인 목표를 동시에 고르기, 새로고침 복귀).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 놓기·넘기기 애니메이션 중간이 찍히지 않게 움직임을 줄인다(global.css 의 motion-reduce)
const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }

/** 봇을 빠르게 */
async function fastBots(page) {
  await page.evaluate(() => localStorage.setItem('tesseract:botSpeed', 'fast'))
  await page.reload()
}

/** 떠 있는 확인 알림을 모두 넘긴다 */
async function confirmNotices(page) {
  for (let i = 0; i < 20; i++) {
    const ok = page.getByRole('button', { name: /^확인/ })
    if ((await ok.count()) === 0) return
    await ok.first().click()
  }
}

/** 조건이 될 때까지 알림을 넘기며 기다린다 */
async function until(page, locator, timeout = 60_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await locator.first().isVisible().catch(() => false)) return
    await confirmNotices(page)
    await page.waitForTimeout(200)
  }
  await page.screenshot({ path: path.join(dir, "shots", "fail.png") })
  throw new Error(`기다린 화면이 나오지 않았습니다: ${locator}`)
}

/** 알림이 끼어들어도 누른다: 알림을 넘기고 다시 시도 */
async function tap(page, locator) {
  for (let i = 0; i < 40; i++) {
    await confirmNotices(page)
    try {
      await locator.first().click({ timeout: 1500 })
      return
    } catch {
      // 알림이 떠 있거나 아직 없다
    }
  }
  await page.screenshot({ path: path.join(dir, 'shots', 'fail.png') })
  throw new Error(`누를 수 없습니다: ${locator}`)
}

async function pickGoal(page) {
  await page.getByRole('button', { name: /개인 목표 1/ }).click()
  await page.getByRole('button', { name: /로 확정$/ }).click()
}

await withGame(dir, async ({ url, open, shot }) => {
  // 한 기기: 나 vs 봇
  const solo = await open(PHONE)
  await fastBots(solo)
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await solo.getByText('개인 목표를 고르세요').waitFor()
  await shot(solo, '02-setup')
  await pickGoal(solo)
  // 내 차례 시장: 칸을 고르면(남은 칸이 하나면 미리 골라져 있다) 아래 행동 줄에 「가져오기」가 뜬다
  const slot = solo.getByRole('button', { name: /번 칸, .*(눌러서 고르기|한 번 더 누르면 가져오기)$/ })
  await until(solo, slot)
  if ((await slot.first().getAttribute('aria-pressed')) !== 'true') await tap(solo, slot)
  await shot(solo, '03-market')
  await tap(solo, solo.locator('footer').getByRole('button', { name: /가져오기$/ }))
  const die = solo.getByRole('button', { name: /^손에 든 주사위/ })
  await until(solo, die)
  if ((await die.count()) > 1) await tap(solo, die)
  await tap(solo, solo.getByRole('button', { name: /놓을 수 있음/ }))
  await shot(solo, '04-place')
  await tap(solo, solo.locator('footer').getByRole('button', { name: /여기에 놓기$/ }))
  await tap(solo, solo.getByRole('button', { name: '메뉴' }))
  await shot(solo, '05-menu')
  await solo.getByRole('button', { name: '닫기' }).click()

  // 봇끼리 끝까지: 알림 확인 → 결과 → 리플레이 → 기록
  const watch = await open(PHONE)
  await fastBots(watch)
  await watch.getByRole('button', { name: '사람', exact: true }).first().click()
  await watch.getByRole('button', { name: '시작', exact: true }).click()
  await until(watch, watch.getByText('바퀴 2/'))
  await shot(watch, '06-bots')
  await until(watch, watch.getByRole('button', { name: '처음으로' }), 240_000)
  await shot(watch, '07-result')
  await tap(watch, watch.getByRole('button', { name: '리플레이 보기' }))
  await shot(watch, '08-replay')

  // 온라인: 두 기기
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
  await shot(host, '09-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await guest.getByText('개인 목표를 고르세요').waitFor()
  await pickGoal(guest)
  await guest.getByText('다른 플레이어가 개인 목표를 고르는 중').waitFor()
  await shot(guest, '10-online-wait')
  await host.getByText('개인 목표를 고르세요').waitFor()
  await pickGoal(host)
  const mine = (page) => page.getByRole('button', { name: /번 칸, .*(눌러서 고르기|한 번 더 누르면 가져오기)$/ })
  await Promise.race([until(host, mine(host)), until(guest, mine(guest))])
  await guest.reload()
  await until(guest, guest.getByText(/차례/))
  await confirmNotices(guest)
  await shot(guest, '11-online-resumed')

  // 기록·통계: 봇끼리 둔 판이 남아 있다(같은 기기 저장소)
  await watch.getByRole('button', { name: '뒤로' }).click()
  await watch.getByRole('button', { name: '처음으로' }).click()
  await watch.getByRole('button', { name: /기록 · 통계/ }).click()
  await watch.getByRole('button', { name: '이 게임 리플레이 보기' }).first().waitFor()
  await shot(watch, '12-history')
})
console.log('모바일 확인 통과')
