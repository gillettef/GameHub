// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/election/)에서 열어 모든 모드를 둔다.
// 한 기기 나 vs 봇(사전 배치·투입·출발·내리기, 이어 하기, 끝까지·개표 결과), 봇끼리 관전, 온라인(두 기기·새로고침 복귀·관전·다크 테마), 규칙.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

// 버스·도장 연출 중간이 찍히지 않게 움직임을 줄인다(style.css 의 prefers-reduced-motion, 박자도 짧아진다)
const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }
const DARK = { ...PHONE, colorScheme: 'dark' }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const myTurn = (page) => page.getByText(/^내 차례/).waitFor({ timeout: 30_000 })
const resultButton = (page) => page.getByRole('button', { name: '결과 보기' })

/** 내 차례에 할 수 있는 것 하나(빛나는 권역 또는 내리기). 둔 것의 종류를 돌려준다 */
async function move(page) {
  const any = page.locator('.el-hole.can, .el-drop').or(resultButton(page))
  await any.first().waitFor({ timeout: 30_000 })
  if (await resultButton(page).count()) return 'over'
  const drop = page.locator('.el-drop')
  if (await drop.count()) {
    await drop.first().click()
    return 'drop'
  }
  await page.locator('.el-hole.can').first().click()
  return 'hole'
}

await withGame(dir, async ({ url, open, shot }) => {
  // 한 기기: 나 vs 봇. 사전 배치 → 투입 → 출발 → 내리기
  const solo = await open(PHONE)
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await myTurn(solo)
  await shot(solo, '02-setup')
  let sawDrop = false
  let sawPlace = false
  for (let i = 0; i < 40 && !sawDrop; i++) {
    await solo.locator('.el-hole.can, .el-drop').first().waitFor({ timeout: 30_000 })
    if (!sawPlace && (await solo.getByText(/^내 차례 · 예비군 투입/).count())) {
      await shot(solo, '03-place')
      sawPlace = true
    }
    if (await solo.locator('.el-drop').count()) {
      await shot(solo, '04-drop')
      sawDrop = true
    }
    await move(solo)
  }
  assert.ok(sawPlace, '예비군 투입 차례를 봤다')

  // 이어 하기: 새로고침하면 처음 화면에 이어 하기가 있고, 누르면 같은 판으로 돌아온다
  await solo.reload()
  const resume = solo.getByRole('button', { name: /^이어 하기/ })
  await resume.waitFor()
  await resume.click()
  await solo.locator('.el-board').waitFor()
  await solo.getByRole('button', { name: '메뉴' }).click()
  await shot(solo, '05-menu')
  await solo.getByRole('button', { name: '닫기' }).click()

  // 끝까지 두면 개표 결과가 뜬다
  for (let i = 0; i < 600; i++) if ((await move(solo)) === 'over') break
  await solo.getByRole('dialog', { name: '개표 결과' }).waitFor({ timeout: 15_000 })
  await shot(solo, '06-result')
  await solo.getByRole('button', { name: '보드 다시 보기' }).click()
  await shot(solo, '07-over-board')

  // 봇끼리 관전(한 기기에서 두 자리 모두 봇)
  const watch = await open(PHONE)
  await watch.getByRole('button', { name: '사람', exact: true }).click()
  await watch.getByRole('button', { name: '시작', exact: true }).click()
  await watch.getByRole('button', { name: '일시정지' }).waitFor()
  await watch.waitForFunction(() => document.querySelectorAll('.el-tok.t0, .el-tok.t1').length >= 6, null, { timeout: 30_000 })
  await shot(watch, '08-watch-bots')

  // 온라인: 두 기기, 새로고침해도 자리로 돌아온다
  const host = await open(BROWSER)
  await host.getByRole('button', { name: '온라인' }).click()
  await host.getByLabel('닉네임').fill('가람')
  await host.getByRole('button', { name: '방 만들기' }).click()
  const code = (await host.getByTestId('room-code').innerText()).trim()
  assert.match(code, /^[A-Z2-9]{4}$/)
  const guest = await open(DARK)
  await guest.goto(`${url}?room=${code}`)
  await guest.getByLabel('닉네임').fill('나래')
  await guest.getByRole('button', { name: '참가' }).click()
  await host.getByText('나래').waitFor()
  await shot(host, '09-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await host.locator('.el-board').waitFor()
  await guest.locator('.el-board').waitFor()
  // 추첨으로 정해진 선공이 먼저 둔다
  const [first, second] = (await host.getByText(/^내 차례/).count()) ? [host, guest] : [guest, host]
  await myTurn(first)
  await move(first)
  await myTurn(second)
  await guest.reload()
  await guest.locator('.el-board').waitFor()
  await move(second)
  await myTurn(first)
  await shot(guest, '10-online-dark-resumed')
  await shot(host, '11-online-host')

  // 온라인 관전
  const viewer = await open(PHONE)
  await viewer.getByRole('button', { name: '온라인' }).click()
  await viewer.getByLabel(/방 코드/).fill(code)
  await viewer.getByRole('button', { name: '관전' }).click()
  await viewer.locator('.el-board').waitFor()
  assert.equal(await viewer.locator('.el-hole.can').count(), 0, '관전자는 둘 수 없다')
  await shot(viewer, '12-online-watch')

  // 게임 방법
  const rules = await open(PHONE)
  await rules.getByRole('button', { name: '게임 방법' }).click()
  await shot(rules, '13-rules')
})
console.log('모바일 확인 통과')
