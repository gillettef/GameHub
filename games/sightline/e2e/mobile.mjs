// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/sightline/)에서 열어 모든 모드를 둔다.
// 봇과 바로 4인(이동·정찰·메뉴), 바로 시작 링크 3인(새로고침 이어 하기, 끝까지, 결과), 한 기기 돌려 하기(가림막),
// 온라인(두 기기, 새로고침 복귀), 관전, 규칙.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const myTurn = (page) => page.getByText('내 차례', { exact: false }).first()
const isVisible = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible())

/** 옮길 수 있는 말을 찾아 고르고(고른 화면을 찍을 수 있게) 목적지 버튼을 돌려준다 */
async function selectMovable(page) {
  const pieces = page.getByRole('button', { name: /번 손님/ })
  const n = await pieces.count()
  for (let k = 0; k < n; k++) {
    await pieces.nth(k).click()
    const dest = page.getByRole('button', { name: /로 이동$/ })
    if (await dest.count()) return dest.first()
  }
  return null
}

/** 내 차례 하나를 둔다: 정찰 마무리 → 접선 → 이동 → 넘기기 → 지목 → 정찰 */
async function playTurn(page) {
  if (await isVisible(page.getByRole('button', { name: '지목하지 않기' }))) return page.getByRole('button', { name: '지목하지 않기' }).click()
  const contact = page.getByRole('button', { name: /번 접선/ })
  if (await isVisible(contact)) return contact.first().click()
  const dest = await selectMovable(page)
  if (dest) return dest.click()
  if (await isVisible(page.getByRole('button', { name: '넘기기' }))) return page.getByRole('button', { name: '넘기기' }).click()
  const accuse = page.getByRole('button', { name: /^지목 \d/ })
  if (await accuse.isEnabled()) {
    await accuse.click()
    await page.getByRole('button', { name: /지목 가능/ }).first().click()
    return page.getByRole('button', { name: '지목', exact: true }).click()
  }
  await page.getByRole('button', { name: /^정찰 / }).click()
  await page.getByRole('dialog', { name: '정찰' }).getByRole('button', { name: /쪽 · / }).first().click()
}

/** 결과가 뜰 때까지 내 차례마다 둔다 */
async function playToEnd(page, timeout = 240_000) {
  const until = Date.now() + timeout
  const result = page.getByRole('dialog', { name: '결과' })
  while (!(await isVisible(result))) {
    assert.ok(Date.now() < until, '게임이 끝나지 않음')
    const before = await page.getByRole('status').first().innerText()
    if (await isVisible(myTurn(page))) {
      await playTurn(page)
      await page.waitForFunction((b) => document.querySelector('[role="status"]')?.textContent !== b, before, { timeout: 15_000 }).catch(() => {})
    } else await page.waitForTimeout(150)
  }
}

await withGame(dir, async ({ url, open, shot }) => {
  // 처음 화면
  const solo = await open(PHONE)
  await shot(solo, '01-home')

  // 봇과 바로 4인: 이동(말 고르기 → 노란 칸), 정찰, 메뉴
  await solo.getByRole('button', { name: '봇과 바로 4인' }).click()
  await myTurn(solo).waitFor({ timeout: 20_000 })
  await shot(solo, '02-local')
  const dest = await selectMovable(solo)
  assert.ok(dest, '옮길 수 있는 말이 있어야 한다')
  await shot(solo, '03-select')
  await dest.click()
  await solo.getByText('생각 중').first().waitFor()
  await myTurn(solo).waitFor({ timeout: 20_000 })
  await solo.getByRole('button', { name: /^정찰 1/ }).click()
  await shot(solo, '04-scout-pick')
  await solo.getByRole('dialog', { name: '정찰' }).getByRole('button', { name: /쪽 · / }).first().click()
  await solo.getByText('좌석에서 정찰 중').waitFor()
  await shot(solo, '05-scouting')
  await solo.getByRole('button', { name: '지목하지 않기' }).click()
  await solo.getByText('생각 중').first().waitFor()
  await solo.getByLabel('내 정보').getByText('글라스 0').waitFor()
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByText('정찰한다').first().waitFor()
  await shot(solo, '06-menu')
  await solo.getByRole('button', { name: '닫기' }).click()
  await solo.getByRole('button', { name: /봇 로즈/ }).first().click()
  await shot(solo, '07-player')
  await solo.getByRole('button', { name: '닫기' }).click()

  // 바로 시작 링크 3인: 한 수 두고 새로고침해도 이어서, 끝까지 두고 결과
  const quick = await open(PHONE)
  await quick.goto(`${url}?play=3`)
  await myTurn(quick).waitFor({ timeout: 20_000 })
  await playTurn(quick)
  await quick.getByText('생각 중').first().waitFor()
  await quick.goto(url) // 주소의 ?play 를 지워도 저장한 판으로 돌아온다
  await quick.getByText(/라운드 \d\/8/).waitFor()
  assert.equal(await quick.getByRole('button', { name: '봇과 바로 4인' }).count(), 0, '처음 화면이 아니라 판으로 돌아왔다')
  await playToEnd(quick)
  await shot(quick, '08-result')
  await quick.getByRole('button', { name: '보드 보기' }).click()
  await shot(quick, '09-over-board')
  await quick.getByRole('button', { name: '처음으로' }).click()
  await quick.reload()
  await quick.getByRole('button', { name: '봇과 바로 4인' }).waitFor()

  // 한 기기 돌려 하기: 사람 둘이면 넘길 때 가린다
  const hot = await open(PHONE)
  await hot.getByLabel('닉네임').fill('가람')
  await hot.getByRole('button', { name: '3명' }).click()
  await hot.getByRole('button', { name: '봇', exact: true }).first().click()
  await hot.getByLabel('2번 자리 이름').fill('나래')
  await hot.getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByText('기기를 넘겨 주세요').waitFor()
  await shot(hot, '10-handoff')
  await hot.getByRole('button', { name: /입니다 · 보기$/ }).click()
  await hot.getByText(/차례 · 하나만 고르세요/).waitFor({ timeout: 20_000 })
  await playTurn(hot)
  await hot.getByText('기기를 넘겨 주세요').waitFor({ timeout: 20_000 })
  await hot.getByRole('button', { name: /입니다 · 보기$/ }).click()
  await hot.getByText(/차례 · 하나만 고르세요/).waitFor({ timeout: 20_000 })
  await shot(hot, '11-handoff-next')

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
  await shot(host, '12-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await guest.getByText(/라운드 1\/8/).waitFor()
  // 나래 차례가 올 때까지 가람이 둔다
  const until = Date.now() + 60_000
  while (!(await isVisible(myTurn(guest)))) {
    assert.ok(Date.now() < until, '나래 차례가 오지 않음')
    if (await isVisible(myTurn(host))) await playTurn(host)
    await host.waitForTimeout(200)
  }
  await guest.reload()
  await myTurn(guest).waitFor()
  await shot(guest, '13-online-resumed')
  await playTurn(guest)
  await guest.getByText(/차례를 기다리는 중|생각 중/).first().waitFor()

  // 관전: 방 코드로 들어와 공개 정보만 본다
  const watcher = await open(PHONE)
  await watcher.getByRole('button', { name: '온라인' }).click()
  await watcher.getByLabel(/방 코드/).fill(code)
  await watcher.getByRole('button', { name: '관전' }).click()
  await watcher.getByText(/라운드 \d\/8/).waitFor()
  assert.equal(await watcher.getByLabel('내 정보').count(), 0, '관전자는 명단이 없다')
  await shot(watcher, '14-watch')

  // 규칙
  const rules = await open(PHONE)
  await rules.getByRole('button', { name: '규칙 한눈에' }).click()
  await shot(rules, '15-rules')
  await rules.getByRole('button', { name: '닫기' }).click()
  await rules.getByRole('button', { name: '전체 룰북' }).click()
  await rules.getByText('정원 설계도 A').first().waitFor()
  await shot(rules, '16-rulebook')
})
console.log('모바일 확인 통과')
