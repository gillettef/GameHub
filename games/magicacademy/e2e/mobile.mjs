// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/magicacademy/)에서 열어 모드를 둔다.
// 한 기기(나 vs 봇: 선 정하기 → 수업 → 활동 → 굴림·확인, 메뉴·친구 카드), 돌려 하기(가림 화면), 봇끼리 끝까지(졸업식),
// 온라인(두 기기, 대기실 → 시작 → 둘 다 두기, 새로고침 복귀, 관전).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 주사위·알림 등장 연출 중간이 찍히지 않게 움직임을 줄인다
const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }

async function fast(page) {
  await page.evaluate(() => localStorage.setItem('magicacademy:botSpeed', 'fast'))
  await page.reload()
}

/** 떠 있는 주차 알림을 모두 넘긴다 */
async function notices(page) {
  for (let i = 0; i < 20; i++) {
    const ok = page.getByRole('dialog').getByRole('button', { name: /^(확인|시작하기)/ })
    if ((await ok.count()) === 0) return
    await ok.first().click().catch(() => {})
  }
}

/** 내 차례에 할 수 있는 것을 하나 한다. 한 게 있으면 그 이름 */
async function step(page) {
  await notices(page)
  const footer = page.locator('footer')
  for (const name of [/주사위 \d*개? ?굴리기$|^주사위 굴리기$/, /^결과 확인$/]) {
    const b = footer.getByRole('button', { name })
    if (await b.count()) {
      await b.first().click()
      return String(name)
    }
  }
  const board = page.getByTestId('board')
  for (const name of [/^배우기/, /^이 카드 고르기$/, /^가져가기$/, /^친구 지목하기$/]) {
    const b = board.getByRole('button', { name }).filter({ hasNot: page.locator('[disabled]') })
    const n = await b.count()
    for (let i = 0; i < n; i++) {
      if (await b.nth(i).isEnabled()) {
        await b.nth(i).click()
        if (String(name).includes('지목')) await board.getByRole('button', { name: /주문력 \d/ }).first().click()
        return String(name)
      }
    }
  }
  return null
}

/** 조건이 될 때까지 내 차례를 두며 기다린다 */
async function playUntil(page, done, timeout = 90_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await done()) return
    await step(page).catch(() => {})
    await page.waitForTimeout(150)
  }
  await page.screenshot({ path: path.join(dir, 'shots', 'fail.png') })
  throw new Error('기다린 화면이 나오지 않았습니다')
}

const visible = (loc) => () => loc.first().isVisible().catch(() => false)

await withGame(dir, async ({ url, open, shot }) => {
  // 한 기기: 나 vs 봇
  const solo = await open(PHONE)
  await fast(solo)
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await solo.getByText('선 정하기').first().waitFor()
  await shot(solo, '02-first-roll')
  await playUntil(solo, visible(solo.getByTestId('board').getByRole('button', { name: /^배우기/ })))
  await notices(solo)
  await shot(solo, '03-class')
  await playUntil(solo, visible(solo.getByTestId('board').getByRole('button', { name: /^이 카드 고르기$|^친구 지목하기$/ })))
  await notices(solo)
  await shot(solo, '04-activity')
  await playUntil(solo, visible(solo.locator('footer').getByRole('button', { name: /^결과 확인$/ })))
  await notices(solo)
  await shot(solo, '05-rolled')
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('tab', { name: '친구들' }).click()
  await shot(solo, '06-menu')
  await solo.getByRole('button', { name: '닫기' }).click()
  await solo.locator('footer').getByRole('button', { name: /^결과 확인$/ }).click()
  await notices(solo)
  await solo.getByRole('button', { name: '내 카드 자세히 보기' }).click()
  await shot(solo, '07-my-cards')
  await solo.getByRole('button', { name: '닫기' }).click()
  // 이어 하기: 처음으로 갔다가 돌아온다
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('button', { name: '처음 화면으로' }).click()
  await solo.getByRole('button', { name: '나가기', exact: true }).click()
  await solo.getByRole('button', { name: /이어 하기/ }).click()
  await solo.getByTestId('board').waitFor()

  // 돌려 하기: 사람 둘이면 차례가 바뀔 때 가림 화면
  const hot = await open(PHONE)
  await hot.getByRole('button', { name: '봇', exact: true }).first().click()
  await hot.getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByRole('button', { name: /입니다 · 보기$/ }).waitFor()
  await shot(hot, '08-hotseat-cover')
  await hot.getByRole('button', { name: /입니다 · 보기$/ }).click()
  await hot.locator('footer').getByRole('button', { name: /굴리기$/ }).click()
  await hot.locator('footer').getByRole('button', { name: /^결과 확인$/ }).click()
  await hot.getByRole('button', { name: /2번 자리|입니다 · 보기$/ }).first().waitFor()
  assert.ok(await hot.getByRole('button', { name: /입니다 · 보기$/ }).isVisible(), '다음 사람 차례에 가림 화면')

  // 봇끼리 끝까지(빠르게): 졸업식
  const watch = await open(PHONE)
  await fast(watch)
  await watch.getByRole('button', { name: '사람', exact: true }).first().click()
  await watch.getByRole('button', { name: '시작', exact: true }).click()
  await watch.getByText(/2\/12개월/).waitFor({ timeout: 120_000 })
  await shot(watch, '09-bots')
  await watch.getByText('게임 끝! 졸업식').waitFor({ timeout: 600_000 })
  await watch.getByRole('button', { name: '건너뛰기' }).click().catch(() => {})
  await shot(watch, '10-graduation')

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
  await shot(host, '11-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await guest.getByText('선 정하기').first().waitFor()
  // 둘 다 수업 카드 단계까지 둔다
  const atClass = (p) => visible(p.getByText('2주차 정규수업').first())
  const bothClass = async () => (await atClass(host)()) && (await atClass(guest)())
  const end = Date.now() + 90_000
  while (!(await bothClass()) && Date.now() < end) {
    await step(host).catch(() => {})
    await step(guest).catch(() => {})
    await host.waitForTimeout(200)
  }
  assert.ok(await bothClass(), '온라인 두 기기가 수업 단계로')
  await notices(guest)
  await shot(guest, '12-online')
  await guest.reload()
  await guest.getByTestId('board').waitFor()
  await guest.getByText('2주차 정규수업').first().waitFor()
  await notices(guest)
  await shot(guest, '13-online-resumed')
  // 관전
  const viewer = await open(PHONE)
  await viewer.getByRole('button', { name: '온라인' }).click()
  await viewer.getByLabel(/방 코드/).fill(code)
  await viewer.getByRole('button', { name: '관전' }).click()
  await viewer.getByTestId('board').waitFor()
  assert.equal(await viewer.getByRole('button', { name: '내 카드 자세히 보기' }).count(), 0, '관전은 내 영역이 없다')
  await shot(viewer, '14-watch')
})
console.log('모바일 확인 통과')
