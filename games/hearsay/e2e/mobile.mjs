// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/hearsay/)에서 열어
// 봇 대전(점유 → 점유 공개 → 망각 → 회의·속삭임·말·증언 → 시간을 앞당겨 결과), 한 기기 돌려 하기(가림막),
// 바로 시작 링크(?play=5), 온라인(두 기기, 말, 새로고침 복귀, 관전)을 둔다.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }

const status = (page) => page.locator('header [role="status"]')

/** 구역 카드 하나를 골라 놓는다 */
async function claim(page, index = 0) {
  await page.locator('.hs-hand .hs-choice').nth(index).click()
  await page.getByRole('button', { name: /카드 놓기$/ }).click()
}

/** 점유가 끝나 회의(질문 칸 고르기·속삭임)에 들어갈 때까지, 내 차례의 점유는 둔다 */
async function untilCouncil(page, ff) {
  for (let k = 0; k < 400; k++) {
    const s = await status(page).innerText()
    if (/질문자|질문 칸 고르는 중|증언 토큰|주먹을 내밀었|속삭임/.test(s)) return
    if (/구역 카드 한 장을 고르세요/.test(s)) await claim(page, k % 3)
    await ff(1000)
  }
  throw new Error('회의에 들어가지 못했습니다')
}

await withGame(dir, async ({ url, open, shot }) => {
  // ---------------------------------------------------------------- 봇 대전 (시간은 Playwright 시계로 앞당긴다)
  const solo = await open(PHONE)
  await solo.clock.install()
  await solo.reload()
  const ff = (ms) => solo.clock.fastForward(ms)
  await solo.getByRole('heading', { name: /HEARSAY/ }).waitFor()
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '봇과 4인' }).click()
  await status(solo).getByText('구역 카드 한 장을 고르세요').waitFor()
  await solo.locator('.hs-hand .hs-choice').first().click()
  await shot(solo, '02-claim')
  await solo.getByRole('button', { name: /카드 놓기$/ }).click()
  await status(solo).getByText(/카드를 놓았습니다|점유 공개/).waitFor()
  for (let k = 0; k < 20 && !/점유 공개/.test(await status(solo).innerText()); k++) await ff(1000)
  await shot(solo, '03-claim-result')
  for (let k = 0; k < 20 && !/구역 카드 한 장을/.test(await status(solo).innerText()); k++) await ff(1000)
  await claim(solo, 1)
  await untilCouncil(solo, ff)
  // 질문자면 칸을 고르고, 아니면 봇이 고를 때까지
  for (let k = 0; k < 30; k++) {
    const s = await status(solo).innerText()
    if (/당신이 질문자/.test(s)) {
      await solo.locator('.hs-hand .hs-choice').first().click()
      await shot(solo, '04-choose')
      await solo.getByRole('button', { name: /묻기$/ }).click()
    }
    if (/증언 토큰을 고르세요/.test(s)) break
    await ff(1000)
  }
  await status(solo).getByText('주장하고 증언 토큰을 고르세요').waitFor()
  await ff(3000) // 봇이 말한다
  await solo.getByRole('button', { name: /^💬 말/ }).click()
  await solo.getByRole('dialog', { name: /말/ }).waitFor()
  await shot(solo, '05-talk')
  await solo.getByRole('button', { name: '아무도 없었어' }).click()
  await solo.getByLabel('할 말').fill('나는 그 계절 포구에 있었어')
  await solo.getByRole('button', { name: '말하기', exact: true }).click()
  await solo.getByRole('dialog').getByText('나는 그 계절 포구에 있었어').waitFor()
  await solo.getByRole('button', { name: '닫기' }).click()
  await solo.getByRole('button', { name: '아무도 없었다' }).click()
  await shot(solo, '06-whisper')
  await solo.getByRole('button', { name: /주먹 내밀기/ }).click()
  for (let k = 0; k < 60 && !/증언 공개/.test(await status(solo).innerText()); k++) await ff(1000)
  await shot(solo, '07-result')
  // 메뉴: 일시정지·규칙
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('button', { name: /규칙 요약/ }).click()
  await shot(solo, '08-menu')
  await solo.getByRole('button', { name: /일시정지/ }).click()
  await status(solo).getByText(/일시정지/).waitFor()
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('button', { name: /계속/ }).click()
  // 나는 아무것도 하지 않는다: 시간 초과(무작위 점유·자동 질문·무효 증언)와 봇으로 끝까지
  for (let k = 0; k < 3000 && !(await solo.getByRole('dialog', { name: '결과' }).isVisible()); k++) await ff(4000)
  await solo.getByRole('dialog', { name: '결과' }).waitFor()
  await shot(solo, '09-final')
  await solo.getByRole('button', { name: '닫기' }).click()
  await shot(solo, '10-final-board')
  await solo.close()

  // ---------------------------------------------------------------- 한 기기 돌려 하기: 사람 둘이면 넘길 때 가린다
  const pass = await open(PHONE)
  await pass.getByRole('button', { name: '봇', exact: true }).first().click()
  await pass.getByRole('button', { name: '시작', exact: true }).click()
  await pass.getByText('기기를 넘겨 주세요').waitFor()
  await shot(pass, '11-pass-cover')
  await pass.getByRole('button', { name: /보기$/ }).click()
  await claim(pass, 0)
  await pass.getByText('기기를 넘겨 주세요').waitFor()
  assert.match(await pass.locator('main').innerText(), /2번/)
  await pass.getByRole('button', { name: /보기$/ }).click()
  await status(pass).getByText('구역 카드 한 장을 고르세요').waitFor()
  await pass.close()

  // ---------------------------------------------------------------- 바로 시작 링크
  const quick = await open(PHONE)
  await quick.goto(`${url}?play=5`)
  await status(quick).getByText('구역 카드 한 장을 고르세요').waitFor()
  assert.equal(await quick.locator('ul li button[aria-current], ul li button').filter({ hasText: /\d/ }).count() >= 5, true)
  await quick.close()

  // ---------------------------------------------------------------- 온라인: 두 기기
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
  await shot(host, '12-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await status(guest).getByText('구역 카드 한 장을 고르세요').waitFor()
  await guest.getByRole('button', { name: /^💬 말/ }).click()
  await guest.getByLabel('할 말').fill('나 강가 간다')
  await guest.getByRole('button', { name: '말하기', exact: true }).click()
  await guest.getByRole('button', { name: '닫기' }).click()
  await host.locator('.hs-panel').getByText('나 강가 간다').waitFor()
  await claim(guest, 0)
  await status(guest).getByText(/카드를 놓았습니다|점유 공개/).waitFor()
  await shot(host, '13-online-host')
  await guest.reload()
  await guest.locator('.hs-board').waitFor()
  assert.doesNotMatch(await status(guest).innerText(), /구역 카드 한 장을 고르세요/)
  await shot(guest, '14-online-resumed')
  // 관전
  const watcher = await open(PHONE)
  await watcher.goto(`${url}?room=${code}`)
  await watcher.getByRole('button', { name: '관전' }).click()
  await watcher.getByText('관전 중').waitFor()
  await shot(watcher, '15-watch')
})
console.log('모바일 확인 통과')
