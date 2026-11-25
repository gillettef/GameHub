// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/proxymind/)에서 열어 모든 모드를 둔다.
// 봇과 4인(설계·개입·메뉴·플레이어), 바로 시작 링크 3인(새로고침 이어 하기, 끝까지, 결과), 한 기기 돌려 하기(가림막),
// 온라인(두 기기, 새로고침 복귀), 관전, 봇끼리 관전, 자동 시뮬레이션, 규칙.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const status = (page) => page.getByRole('status').first()
const isVisible = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible())
// 누를 수 있는 손패만(확정한 뒤 남을 기다리는 동안에는 비활성으로 남는다)
const handTiles = (page) => page.getByRole('button', { name: / 꽂기$/, disabled: false })
const confirmIv = (page) => page.getByRole('button', { name: /^확정 · / })

/** 내 차례(설계 또는 실행)인지 */
async function myTurn(page) {
  return (await isVisible(handTiles(page))) || (await isVisible(confirmIv(page)))
}

/** 내 차례 하나를 둔다: 설계면 앞의 타일 3개를 꽂고 확정, 실행이면 지금 고른 개입(기본: 개입 안 함)으로 확정 */
async function playTurn(page) {
  if (await isVisible(handTiles(page))) {
    // 봇이 두는 동안 손패가 다시 그려질 수 있어, 확정 버튼이 켜질 때까지 타일을 꽂는다(한 번의 클릭이 빗나가도 다시)
    const done = page.getByRole('button', { name: '확정', exact: true })
    for (let k = 0; k < 12 && !(await done.isEnabled().catch(() => false)); k++) {
      await page.locator('button:not([disabled])').filter({ hasText: /지금 (참|거짓)/ }).first().click({ timeout: 3000 }).catch(() => {})
    }
    // 확인하는 사이 단계가 넘어갔으면(모두 제출해 실행 단계로) 이번에는 둘 것이 없다
    if (!(await done.isEnabled().catch(() => false))) return
    // 누르기 직전에 단계가 넘어갈 수도 있다(누를 것이 없으면 다음 바퀴에서 다시 본다)
    return done.click({ timeout: 3000 }).catch(() => {})
  }
  if (await isVisible(confirmIv(page))) return confirmIv(page).click()
}

/** 결과가 뜰 때까지 내 차례마다 둔다 */
async function playToEnd(page, timeout = 240_000) {
  const until = Date.now() + timeout
  const result = page.getByRole('dialog', { name: '결과' })
  while (!(await isVisible(result))) {
    assert.ok(Date.now() < until, '게임이 끝나지 않음')
    if (await myTurn(page)) {
      const before = await status(page).innerText()
      await playTurn(page)
      await page.waitForFunction((b) => document.querySelector('[role="status"]')?.textContent !== b, before, { timeout: 15_000 }).catch(() => {})
    } else await page.waitForTimeout(150)
  }
}

/** 봇을 빠르게(옛 화면의 "빠르게") */
async function fastBots(page) {
  await page.evaluate(() => localStorage.setItem('proxymind:settings', JSON.stringify({ level: 'normal', speed: 3 })))
}

await withGame(dir, async ({ url, open, shot }) => {
  // 처음 화면
  const solo = await open(PHONE)
  await shot(solo, '01-home')

  // 봇과 4인: 설계(타일 꽂기·빼기·확정) → 실행(개입 고르기·미리보기) → 메뉴·플레이어
  await solo.getByRole('button', { name: '봇과 4인' }).click()
  await status(solo).getByText('설계:').waitFor()
  await shot(solo, '02-design')
  const free = () => solo.locator('button:not([disabled])').filter({ hasText: /지금 (참|거짓)/ })
  await free().first().click()
  await free().first().click()
  await solo.getByRole('button', { name: '슬롯 1에서 빼기' }).click()
  await free().first().click()
  await free().first().click()
  await shot(solo, '03-design-picked')
  await solo.getByRole('button', { name: '확정', exact: true }).click()
  await confirmIv(solo).waitFor({ timeout: 30_000 })
  const left = solo.getByRole('button', { name: '좌회전' })
  if (await left.isEnabled()) await left.click()
  await shot(solo, '04-intervene')
  await confirmIv(solo).click()
  await solo.getByText(/생각 중|설계:/).first().waitFor()
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByText('설계 완료').first().waitFor()
  await shot(solo, '05-menu')
  await solo.getByRole('button', { name: '닫기' }).click()
  await solo.getByRole('button', { name: /봇 브라보/ }).first().click()
  await shot(solo, '06-player')
  await solo.getByRole('button', { name: '닫기' }).click()

  // 바로 시작 링크 3인: 한 수 두고 새로고침해도 이어서, 끝까지 두고 결과
  const quick = await open(PHONE)
  await fastBots(quick)
  await quick.goto(`${url}?play=3`)
  await status(quick).getByText('설계:').waitFor()
  await playTurn(quick)
  await quick.getByText(/실행 중|실행 차례|설계 완료/).first().waitFor()
  await quick.goto(url) // 주소의 ?play 를 지워도 저장한 판으로 돌아온다
  await quick.getByText(/\d\/8 라운드/).waitFor()
  assert.equal(await quick.getByRole('button', { name: '봇과 4인' }).count(), 0, '처음 화면이 아니라 판으로 돌아왔다')
  await playToEnd(quick)
  await shot(quick, '07-result')
  await quick.getByRole('button', { name: '보드 보기' }).click()
  await shot(quick, '08-over-board')
  await quick.getByRole('button', { name: '처음으로' }).click()
  await quick.reload()
  await quick.getByRole('button', { name: '봇과 4인' }).waitFor()

  // 한 기기 돌려 하기: 사람 둘이면 설계를 넘길 때 가린다
  const hot = await open(PHONE)
  await hot.getByLabel('닉네임').fill('가람')
  await hot.getByRole('button', { name: '3명' }).click()
  await hot.getByRole('button', { name: '봇', exact: true }).first().click()
  await hot.getByLabel('2번 자리 이름').fill('나래')
  await hot.getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByText('기기를 넘겨 주세요').waitFor()
  await shot(hot, '09-handoff')
  await hot.getByRole('button', { name: /입니다 · 보기$/ }).click()
  await status(hot).getByText('설계:').waitFor()
  await playTurn(hot)
  await hot.getByText('기기를 넘겨 주세요').waitFor({ timeout: 20_000 })
  await hot.getByRole('button', { name: /나래입니다 · 보기$/ }).click()
  await status(hot).getByText('나래 · 설계:').waitFor()
  await shot(hot, '10-handoff-next')
  await playTurn(hot)
  await hot.getByText(/실행 중|실행 차례/).first().waitFor({ timeout: 20_000 })
  assert.equal(await hot.getByText('기기를 넘겨 주세요').count(), 0, '실행 단계는 가리지 않는다')

  // 온라인: 두 기기, 새로고침해도 자리로 돌아온다. 빈자리 하나는 봇
  const host = await open(BROWSER)
  await host.getByRole('button', { name: '온라인' }).click()
  await host.getByLabel('닉네임').fill('가람')
  await host.getByRole('button', { name: '3명' }).click()
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
  await status(guest).getByText('설계:').waitFor()
  await shot(host, '12-online-design')
  await playTurn(host)
  await guest.reload()
  await status(guest).getByText('설계:').waitFor()
  await shot(guest, '13-online-resumed')
  await playTurn(guest)
  // 둘 다 실행 차례를 한 번씩 둔다(설계 단계가 늦게 끝날 수 있어 넉넉히)
  const until = Date.now() + 150_000
  const played = new Set()
  while (played.size < 2) {
    assert.ok(Date.now() < until, '실행 차례가 오지 않음')
    for (const [name, page] of [
      ['host', host],
      ['guest', guest],
    ]) {
      if (await isVisible(confirmIv(page))) {
        await confirmIv(page).click()
        // 확정이 받아들여지면 차례가 넘어가 버튼이 사라진다. 거절됐으면 이유를 남긴다
        await confirmIv(page).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        played.add(name)
      } else if (await isVisible(handTiles(page))) await playTurn(page)
    }
    await host.waitForTimeout(200)
  }

  // 관전: 방 코드로 들어와 공개 정보만 본다
  const watcher = await open(PHONE)
  await watcher.getByRole('button', { name: '온라인' }).click()
  await watcher.getByLabel(/방 코드/).fill(code)
  await watcher.getByRole('button', { name: '관전', exact: true }).click()
  await watcher.getByText(/\d\/8 라운드/).waitFor()
  assert.equal(await handTiles(watcher).count(), 0, '관전자는 손패가 없다')
  await shot(watcher, '14-watch')

  // 봇끼리 관전(한 기기)
  const bots = await open(PHONE)
  await bots.getByRole('button', { name: '봇끼리 관전' }).click()
  await bots.getByText(/로봇 실행 중/).first().waitFor({ timeout: 30_000 })
  await shot(bots, '15-bots')

  // 자동 시뮬레이션
  const sim = await open(PHONE)
  await sim.getByRole('button', { name: '자동 시뮬레이션' }).click()
  await sim.getByRole('button', { name: '50', exact: true }).click()
  await sim.getByRole('button', { name: '실행', exact: true }).click()
  await sim.getByRole('button', { name: '다시 실행' }).waitFor({ timeout: 120_000 })
  await sim.getByText('설계자 점수 비중', { exact: true }).waitFor()
  await shot(sim, '16-sim')

  // 규칙
  const rules = await open(PHONE)
  await rules.getByRole('button', { name: '규칙 요약' }).click()
  await shot(rules, '17-rules')
})
console.log('모바일 확인 통과')
