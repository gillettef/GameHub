// 빌드 결과를 허브(/blackcrown/)에서 열어 한 기기 봇 대전을 끝까지(대관식·최종전·결과) 두고, 온라인 대기실·재접속을 확인한다.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 시트가 떠 있으면 첫 선택지/패스, 내 차례면 끝내기. 대관식은 건너뛴다 */
async function step(page, seen) {
  const skip = page.getByRole('button', { name: /건너뛰기|최종전으로/ })
  if (await skip.count()) {
    if (!seen.coronation) {
      seen.coronation = true
      return 'coronation'
    }
    await skip.first().click({ timeout: 2000 }).catch(() => {})
    return 'skip'
  }
  const dialog = page.getByRole('dialog')
  if (await dialog.count()) {
    const pass = dialog.getByRole('button', { name: '패스' })
    if (await pass.count()) return pass.click({ timeout: 2000 }).catch(() => {})
    const choice = dialog.locator('.bc-combo, .bc-btn').first()
    if (await choice.count()) return choice.click({ timeout: 2000 }).catch(() => {})
  }
  const end = page.locator('footer').getByRole('button', { name: '끝내기' })
  if ((await end.count()) && (await end.isEnabled({ timeout: 500 }).catch(() => false))) return end.click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(120)
}

await withGame(dir, async ({ url, open, shot }) => {
  const solo = await open()
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await solo.getByText('“가장 빛나는 자가 검은 왕관을 쓰리라”').waitFor()
  await solo.getByText(/직업을 고르세요|직업을 고르는 중/).waitFor()
  await solo.locator('.bcx-class:enabled').first().waitFor({ timeout: 15000 })
  await shot(solo, '02-draft')
  await solo.locator('.bcx-class:enabled').first().click()
  await solo.getByText('내 차례').waitFor({ timeout: 20000 })
  await shot(solo, '03-game')

  await solo.locator('footer').getByRole('button', { name: '행동' }).click()
  await solo.getByRole('dialog').waitFor()
  await shot(solo, '04-here')
  await solo.getByRole('button', { name: '닫기' }).click()

  // 휴대폰에서는 보드가 미니맵이다: 누르면 확대, 확대한 지도에서 갈 수 있는 칸을 눌러 이동
  const map = solo.locator('.bcm-map')
  assert.ok(await map.evaluate((el) => el.classList.contains('is-mini')), '휴대폰 보드는 미니맵으로 시작해야 합니다')
  await solo.locator('.bcm-cell[data-cell]').first().waitFor()
  const camp = solo.locator('.bcm-pawn.is-me').first()
  await camp.click({ force: true })
  await solo.locator('.bcm-map.is-zoomed').waitFor()
  await shot(solo, '03b-zoom')
  const reach = solo.locator('.bcm-cell.is-reachable').first()
  if (await reach.count()) {
    const before = await solo.locator('.bcm-pawn.is-me').first().evaluate((el) => el.closest('[data-cell]')?.getAttribute('data-cell'))
    await reach.click({ force: true })
    await solo.waitForTimeout(300)
    const after = await solo.locator('.bcm-pawn.is-me').first().evaluate((el) => el.closest('[data-cell]')?.getAttribute('data-cell'))
    assert.notEqual(after, before, '확대한 지도에서 칸을 눌러 이동해야 합니다')
  }
  await solo.getByRole('button', { name: '전체', exact: true }).click()
  await solo.locator('.bcm-map.is-mini').waitFor()

  // 두 손가락으로 벌리면 배율이 자유롭게 커지고, + 버튼으로도 커진다
  const scaleOf = () => map.evaluate((el) => Number(el.getAttribute('data-scale')))
  const fitScale = await scaleOf()
  await map.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const fire = (type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }))
    fire('pointerdown', 1, cx - 30, cy)
    fire('pointerdown', 2, cx + 30, cy)
    for (let k = 1; k <= 5; k++) fire('pointermove', 2, cx + 30 + k * 12, cy)
    fire('pointerup', 2, cx + 90, cy)
    fire('pointerup', 1, cx - 30, cy)
  })
  const pinched = await scaleOf()
  assert.ok(pinched > fitScale * 1.3 && pinched < fitScale * 2.2, `핀치 배율 ${fitScale} → ${pinched}`)
  await solo.getByRole('button', { name: '확대', exact: true }).click()
  assert.ok((await scaleOf()) > pinched, '+ 버튼으로 더 커져야 합니다')
  await solo.getByRole('button', { name: '전체', exact: true }).click()

  await solo.getByRole('button', { name: '메뉴' }).click()
  await shot(solo, '05-menu')
  await solo.getByRole('button', { name: '닫기' }).click()

  const seen = {}
  let shotFinal = false
  for (let k = 0; k < 4000; k++) {
    if (await solo.getByRole('button', { name: '처음으로' }).count()) break
    const r = await step(solo, seen)
    if (r === 'coronation') {
      await solo.waitForTimeout(400)
      await solo.screenshot({ path: path.join(dir, 'shots', '06-coronation.png') })
    }
    if (!shotFinal && (await solo.locator('.bc-demonbar').count()) && !(await solo.getByRole('dialog').count()) && !(await solo.locator('.bcx-overlay').count())) {
      shotFinal = true
      await shot(solo, '07-final')
    }
  }
  await solo.getByRole('button', { name: '처음으로' }).waitFor()
  await shot(solo, '08-result')
  assert.ok(seen.coronation, '대관식을 보지 못했습니다')

  // 온라인: 방 만들기 → 참가 → 시작 → 새로고침 복귀
  const host = await open(IPHONE_17_PRO_BROWSER)
  await host.getByRole('button', { name: '온라인' }).click()
  await host.getByLabel('닉네임').fill('가람')
  await host.getByRole('button', { name: '3명' }).click()
  await host.getByRole('button', { name: '방 만들기' }).click()
  const code = (await host.getByTestId('room-code').innerText()).trim()
  assert.match(code, /^[A-Z2-9]{4}$/)
  const guest = await open()
  await guest.goto(`${url}?room=${code}`)
  await guest.getByLabel('닉네임').fill('나래')
  await guest.getByRole('button', { name: '참가' }).click()
  await host.getByText('나래').waitFor()
  await shot(host, '09-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await host.getByText('“가장 빛나는 자가 검은 왕관을 쓰리라”').waitFor()
  // 직업 고르기는 차례대로라(봇 연출 포함) 언제 내 차례가 올지 모른다: 두 사람 모두 보드가 뜰 때까지 계속 시도한다
  for (let k = 0; k < 240 && !((await guest.locator('.bcm-map').count()) && (await host.locator('.bcm-map').count())); k++) {
    for (const page of [host, guest]) {
      const pick = page.locator('.bcx-class:enabled').first()
      if (await pick.count()) await pick.click({ timeout: 2000 }).catch(() => {})
    }
    await guest.waitForTimeout(250)
  }
  await guest.locator('.bcm-map').waitFor({ timeout: 20000 })
  await guest.reload()
  await guest.locator('.bcm-map').waitFor({ timeout: 20000 })
  await shot(guest, '10-resumed')
})
console.log('모바일 확인 통과')
