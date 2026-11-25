// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/smilepark/)에서 열어 모든 모드를 둔다.
// 한 기기 AI 대전(건설·입찰·모집·입장료·배치·결과·관리 한 라운드, 시설 정보, 메뉴, 새로고침 뒤 이어 하기, 끝까지),
// 돌려 하기(사람 둘 + 봇, 비밀 단계의 가림 화면), 봇끼리 관전(진행·일시정지), 온라인(두 기기, 빈자리 봇, 새로고침 복귀), 관전, 규칙.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const status = (page) => page.locator('header [role="status"] > div').first()
const btn = (page, name) => page.getByRole('button', { name, exact: true })
const visible = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible())

/** 지금 할 일에 맞춰 한 수 둔다. 둔 것이 없으면 false */
async function step(page) {
  const cover = page.getByRole('button', { name: /입니다 · 시작$/ })
  if (await visible(cover)) return cover.click().then(() => true)
  if (!(await visible(status(page)))) return false
  const s = await status(page).innerText()
  if (process.env.E2E_DEBUG) console.log('[상태]', s)
  if (/시설 건설$/.test(s)) await btn(page, '건설 마치기').click()
  else if (/홍보 입찰$/.test(s)) await page.getByRole('button', { name: /^입찰 공개/ }).click()
  else if (/관객 모집$/.test(s)) {
    const open = page.locator('button.vcard.open:enabled')
    if (await open.count()) await open.first().click()
    else await page.getByRole('button', { name: /그만 데려오기|모집 없이 진행/ }).click()
  } else if (/입장료 정하기$/.test(s)) await btn(page, '문 열기').click()
  else if (/그룹 배치$/.test(s)) {
    await page.getByRole('button', { name: /추천/ }).click()
    await btn(page, '운영 시작').click()
  } else if (/운영 결과 확인$/.test(s)) await page.getByRole('button', { name: /관리 단계로/ }).click()
  else if (/관리$/.test(s)) await page.getByRole('button', { name: /^라운드 종료/ }).click()
  else return false
  await page.waitForFunction((b) => document.querySelector('header [role="status"] > div')?.textContent !== b, s, { timeout: 15_000 }).catch(() => {})
  return true
}

async function playUntil(pages, done, timeout = 180_000) {
  const until = Date.now() + timeout
  while (!(await done())) {
    assert.ok(Date.now() < until, '시간 안에 끝나지 않음')
    let moved = false
    for (const page of pages) moved = (await step(page)) || moved
    if (!moved) await pages[0].waitForTimeout(150)
  }
}
const isOver = (page) => async () => /^게임 종료/.test(await status(page).innerText().catch(() => ''))

await withGame(dir, async ({ url, open, shot }) => {
  // 처음 화면
  const solo = await open(PHONE)
  await shot(solo, '01-home')

  // 한 기기 AI 대전 3인: 한 라운드를 화면으로 확인 (E2E_SKIP_SOLO=1 이면 건너뛴다: 뒤쪽 모드만 고칠 때)
  if (!process.env.E2E_SKIP_SOLO) {
  await solo.getByLabel('닉네임').fill('가람')
  await btn(solo, '3명').click()
  await btn(solo, '시작').click()
  await status(solo).getByText(/시설 건설|건설 중/).first().waitFor()
  await solo.getByText(/내 차례 · 시설 건설/).first().waitFor({ timeout: 10_000 })
  await shot(solo, '02-construct')
  // 시장 카드를 골라 빈 부지에 짓는다(돈이 되는 카드)
  const card = solo.locator('button.mcard:not(.dim)').first()
  await card.click()
  await shot(solo, '03-construct-picked')
  await solo.getByRole('button', { name: '1번 빈 부지' }).click()
  await solo.getByRole('button', { name: /^1번 부지 / }).waitFor()
  await solo.getByRole('button', { name: /^1번 부지 / }).click()
  await solo.getByRole('dialog').waitFor()
  await shot(solo, '04-facility')
  await btn(solo, '닫기').click()
  // 상대 공원 보기
  await solo.getByRole('button', { name: /코코/ }).first().click()
  await solo.getByText('상대 공원 (보기 전용)').waitFor()
  await shot(solo, '05-rival')
  await solo.getByRole('button', { name: /가람/ }).first().click()
  while (!/홍보 입찰$/.test(await status(solo).innerText())) await step(solo)
  await btn(solo, '1 늘리기').click()
  await shot(solo, '06-bid')
  await step(solo)
  while (/관객 모집$|고르는 중/.test(await status(solo).innerText())) {
    if (/관객 모집$/.test(await status(solo).innerText())) {
      await shot(solo, '07-pick')
      await step(solo)
    } else await solo.waitForTimeout(100)
  }
  await solo.getByText(/입장료 정하기/).first().waitFor()
  await shot(solo, '08-fee')
  await btn(solo, '문 열기').click()
  await solo.getByText(/그룹 배치/).first().waitFor()
  const group = solo.locator('button.vcard.mine').first()
  if (await group.count()) await group.click()
  await shot(solo, '09-place')
  await solo.getByRole('button', { name: /추천/ }).click()
  await btn(solo, '운영 시작').click()
  await solo.getByRole('button', { name: /관리 단계로/ }).waitFor()
  await shot(solo, '10-result')
  await solo.getByRole('button', { name: /관리 단계로/ }).click()
  await solo.getByText(/내 차례 · 관리/).first().waitFor()
  await shot(solo, '11-manage')
  await btn(solo, '메뉴').click()
  await solo.getByRole('dialog', { name: '메뉴' }).waitFor()
  await shot(solo, '12-menu')
  await btn(solo, '진행 기록').click()
  await solo.getByRole('dialog', { name: '진행 기록' }).waitFor()
  await btn(solo, '닫기').click()
  await solo.getByRole('button', { name: /^라운드 종료/ }).click()
  await solo.getByText(/2\/8 라운드/).first().waitFor()

  // 새로고침해도 처음 화면의 '이어 하기'로 같은 판에 돌아온다
  await solo.reload()
  await solo.getByRole('button', { name: '이어 하기 (라운드 2/8)' }).waitFor()
  await shot(solo, '13-home-continue')
  await solo.getByRole('button', { name: '이어 하기 (라운드 2/8)' }).click()
  await solo.getByText(/2\/8 라운드/).first().waitFor()
  await playUntil([solo], isOver(solo))
  await solo.getByRole('dialog', { name: '게임 결과' }).waitFor()
  await shot(solo, '14-final')
  await btn(solo, '공원 보기').click()
  await shot(solo, '15-final-park')
  await btn(solo, '처음으로').click()
  await solo.getByLabel('닉네임').waitFor()
  assert.equal(await solo.getByRole('button', { name: /이어 하기/ }).count(), 0, '끝난 판은 이어 하기에 없다')
  }
  await solo.context().close()

  // 한 기기 돌려 하기: 사람 둘 + 봇 하나. 비밀 단계에서 둘 사람이 바뀔 때 가린다
  const hot = await open(PHONE)
  await hot.getByLabel('닉네임').fill('가람')
  await btn(hot, '3명').click()
  await btn(hot, '봇').first().click()
  await hot.getByLabel('2번 자리 이름').fill('나래')
  await btn(hot, '시작').click()
  while (!(await visible(hot.getByRole('button', { name: /입니다 · 시작$/ })))) await step(hot)
  await shot(hot, '16-handoff')
  const first = (await hot.getByRole('button', { name: /입니다 · 시작$/ }).innerText()).replace(/^제가 | 입니다.*$|입니다 · 시작$/g, '')
  await hot.getByRole('button', { name: /입니다 · 시작$/ }).click()
  await hot.getByText(/차례 · 홍보 입찰/).first().waitFor()
  await shot(hot, '17-hotseat-bid')
  await hot.getByRole('button', { name: /^입찰 공개/ }).click()
  await hot.getByRole('button', { name: /입니다 · 시작$/ }).waitFor()
  assert.ok(!(await hot.getByRole('button', { name: /입니다 · 시작$/ }).innerText()).includes(first), '다음 사람에게 넘긴다')
  await playUntil([hot], async () => /2\/8 라운드/.test(await hot.locator('header').innerText().catch(() => '')))
  await hot.context().close()

  // 봇끼리 관전: 0번 자리가 진행을 맡아 판이 흘러간다. 메뉴에서 일시정지
  const bots = await open(PHONE)
  await btn(bots, '3명').click()
  const toggles = bots.locator('ul li button')
  for (let i = 0; i < (await toggles.count()); i++) if ((await toggles.nth(i).innerText()) === '사람') await toggles.nth(i).click()
  await btn(bots, '시작').click()
  await bots.getByText(/관전 중/).first().waitFor()
  const before = await bots.locator('.ticker').innerText().catch(() => '')
  await bots.waitForFunction((b) => (document.querySelector('.ticker')?.textContent ?? '') !== b, before, { timeout: 20_000 })
  await shot(bots, '18-bots-watch')
  await btn(bots, '메뉴').click()
  await btn(bots, '봇 진행 일시정지').click()
  await btn(bots, '닫기').click()
  await bots.context().close()

  // 온라인: 두 기기, 빈자리는 봇. 새로고침해도 자리로 돌아온다
  const host = await open(BROWSER)
  await btn(host, '온라인').click()
  await host.getByLabel('닉네임').fill('가람')
  await btn(host, '3명').click()
  await btn(host, '방 만들기').click()
  const code = (await host.getByTestId('room-code').innerText()).trim()
  assert.match(code, /^[A-Z2-9]{4}$/)
  const guest = await open(PHONE)
  await guest.goto(`${url}?room=${code}`)
  await guest.getByLabel('닉네임').fill('나래')
  await btn(guest, '참가').click()
  await host.getByText('나래').first().waitFor()
  await shot(host, '19-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await host.locator('header [role="status"]').waitFor()
  await guest.locator('header [role="status"]').waitFor()
  // 입찰까지 둔다
  await playUntil([host, guest], async () => /홍보 입찰$|입찰 완료/.test(await status(host).innerText()))
  while (!/홍보 입찰$/.test(await status(host).innerText())) await host.waitForTimeout(100)
  await host.getByRole('button', { name: /^입찰 공개/ }).click()
  await host.getByText('입찰 완료 · 다른 공원을 기다리는 중').first().waitFor()
  await shot(host, '20-online-bid-wait')
  await guest.reload()
  await guest.getByText(/내 차례 · 홍보 입찰/).first().waitFor()
  await shot(guest, '21-online-resumed')

  // 관전: 방 코드로 들어와 공개 정보만 본다
  const watcher = await open(PHONE)
  await btn(watcher, '온라인').click()
  await watcher.getByLabel(/방 코드/).fill(code)
  await btn(watcher, '관전').click()
  await watcher.getByText(/관전 중/).first().waitFor()
  await shot(watcher, '22-watch')

  await playUntil([host, guest], async () => /2\/8 라운드/.test(await host.locator('header').innerText()))
  await shot(guest, '23-online-round2')

  // 규칙
  const rules = await open(PHONE)
  await rules.getByRole('button', { name: '게임 규칙' }).click()
  await rules.getByRole('dialog', { name: '게임 규칙' }).waitFor()
  await shot(rules, '24-rules')
})
console.log('모바일 확인 통과')
