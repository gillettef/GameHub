// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/retrocause/)에서 열어 모든 모드를 둔다.
// 봇과 4인(카드 고르기·칸 고르기·놓기·교체·메뉴·플레이어 상세), 바로 시작 링크 3인(새로고침 이어 하기, 끝까지, 추리, 결과),
// 한 기기 돌려 하기(가림막), 봇끼리 관전, 온라인(두 기기, 새로고침 복귀, 관전, 둘 다 추리해 결과까지), 규칙.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const status = (page) => page.getByRole('status').first()
const isVisible = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible())
/** 내가 둘 차례(혼자면 '내 차례', 돌려 하기면 '○○ 차례 · ') */
const myTurn = async (page) => /내 차례|차례 · (카드|칸)/.test(await status(page).innerText())
const resultOpen = (page) => isVisible(page.getByRole('button', { name: '시간선 보기' }))

/** 놓을 수 있는 카드를 고르고(고른 화면을 찍을 수 있게) 첫 초록 칸 버튼을 돌려준다. 없으면 null(마지막 카드가 골라진 채) */
async function selectPlaceable(page) {
  const cards = page.getByLabel('내 손패').getByRole('button', { name: /\)$/ })
  const n = await cards.count()
  for (let k = 0; k < n; k++) {
    const c = cards.nth(k)
    if ((await c.getAttribute('aria-pressed')) !== 'true') await c.click()
    const slot = page.getByRole('button', { name: /에 놓을 수 있음$/ })
    if (await slot.count()) return slot.first()
  }
  return null
}

/** 추리 창의 고르기를 서로 다른 인물로 채우고 낸다 */
async function submitGuess(page) {
  const dlg = page.getByRole('dialog', { name: '추리' })
  const selects = dlg.locator('select')
  const n = await selects.count()
  for (let k = 0; k < n; k++) await selects.nth(k).selectOption({ index: k + 1 })
  await dlg.getByRole('button', { name: '제출' }).click()
}

/** 내 차례 하나를 둔다: 추리 → 놓기 → 교체 → 패스 */
async function playTurn(page) {
  if (await isVisible(page.getByRole('dialog', { name: '추리' }))) return submitGuess(page)
  if (await isVisible(page.getByRole('button', { name: '추리하기' }))) {
    await page.getByRole('button', { name: '추리하기' }).click()
    return submitGuess(page)
  }
  const slot = await selectPlaceable(page)
  if (slot) {
    await slot.click()
    return page.getByRole('button', { name: /^칸 \d+에 놓기$/ }).click()
  }
  const exchange = page.getByRole('button', { name: '교체', exact: true })
  if (await exchange.isEnabled()) {
    await exchange.click()
    return page.getByRole('dialog', { name: '교체' }).getByRole('button', { name: '교체', exact: true }).click()
  }
  await page.getByRole('button', { name: '패스', exact: true }).click()
}

const canAct = async (page) =>
  (await myTurn(page)) || (await isVisible(page.getByRole('button', { name: '추리하기' }))) || (await isVisible(page.getByRole('dialog', { name: '추리' })))

/** 결과가 뜰 때까지 내 차례마다 둔다(여러 기기면 함께) */
async function playToEnd(pages, timeout = 300_000) {
  const until = Date.now() + timeout
  for (;;) {
    let done = true
    for (const page of pages) {
      if (await resultOpen(page)) continue
      done = false
      if (await canAct(page)) {
        const before = await status(page).innerText()
        await playTurn(page)
        await page.waitForFunction((b) => document.querySelector('[role="status"]')?.textContent !== b, before, { timeout: 15_000 }).catch(() => {})
      }
    }
    if (done) return
    assert.ok(Date.now() < until, '게임이 끝나지 않음')
    await pages[0].waitForTimeout(120)
  }
}

/** 메뉴에서 봇 속도를 빠르게 */
async function fast(page) {
  await page.getByRole('button', { name: '메뉴' }).click()
  await page.getByRole('button', { name: '빠르게' }).click()
  await page.getByRole('button', { name: '닫기' }).click()
}

await withGame(dir, async ({ url, open, shot }) => {
  // 처음 화면
  const solo = await open(PHONE)
  await shot(solo, '01-home')

  // 봇과 4인: 카드 고르기 → 초록 칸 → 놓기, 교체 확인, 메뉴, 플레이어 상세
  await solo.getByRole('button', { name: '봇과 4인' }).click()
  await solo.getByLabel('시간선').waitFor()
  await fast(solo)
  await solo.waitForFunction(() => /내 차례/.test(document.querySelector('[role="status"]')?.textContent ?? ''), null, { timeout: 30_000 })
  await shot(solo, '02-local')
  let slot = await selectPlaceable(solo)
  if (slot) {
    await shot(solo, '03-select')
    await slot.click()
    await shot(solo, '04-target')
    await solo.getByRole('button', { name: /^칸 \d+에 놓기$/ }).click()
  } else {
    await solo.getByRole('button', { name: '교체', exact: true }).click()
    await shot(solo, '03-exchange')
    await solo.getByRole('dialog', { name: '교체' }).getByRole('button', { name: '교체', exact: true }).click()
  }
  await solo.waitForFunction(() => /내 차례/.test(document.querySelector('[role="status"]')?.textContent ?? ''), null, { timeout: 30_000 })
  await solo.getByLabel('내 손패').getByRole('button', { name: /\)$/ }).first().click()
  await solo.getByRole('button', { name: '교체', exact: true }).click()
  await shot(solo, '05-exchange-ask')
  await solo.getByRole('dialog', { name: '교체' }).getByRole('button', { name: '교체', exact: true }).click()
  await solo.getByRole('button', { name: '비밀 목표 보기' }).click()
  await solo.getByText(/^비밀 목표: /).waitFor()
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByText(/교체 — 「/).first().waitFor()
  await shot(solo, '06-menu')
  await solo.getByRole('button', { name: '닫기' }).click()
  await solo.getByRole('button', { name: /세실리아|베르톨트|아그네스/ }).first().click()
  await shot(solo, '07-player')
  await solo.getByRole('button', { name: '닫기' }).click()

  // 바로 시작 링크 3인: 한 수 두고 새로고침해도 이어서, 끝까지 두고 추리·결과
  const quick = await open(PHONE)
  await quick.goto(`${url}?play=3`)
  await quick.getByLabel('시간선').waitFor()
  await fast(quick)
  await quick.waitForFunction(() => /내 차례/.test(document.querySelector('[role="status"]')?.textContent ?? ''), null, { timeout: 30_000 })
  await playTurn(quick)
  await quick.goto(url) // 주소의 ?play 를 지워도 저장한 판으로 돌아온다
  await quick.getByLabel('시간선').waitFor()
  assert.equal(await quick.getByRole('button', { name: '봇과 4인' }).count(), 0, '처음 화면이 아니라 판으로 돌아왔다')
  await fast(quick)
  const guessDlg = quick.getByRole('dialog', { name: '추리' })
  while (!(await isVisible(guessDlg))) {
    if (await myTurn(quick)) await playTurn(quick)
    await quick.waitForTimeout(100)
  }
  await shot(quick, '08-guess')
  await submitGuess(quick)
  await quick.getByRole('button', { name: '시간선 보기' }).waitFor({ timeout: 10_000 })
  await shot(quick, '09-result')
  await quick.getByRole('button', { name: '시간선 보기' }).click()
  await shot(quick, '10-over-board')
  await quick.getByRole('button', { name: '처음으로' }).click()
  await quick.reload()
  await quick.getByRole('button', { name: '봇과 4인' }).waitFor()

  // 한 기기 돌려 하기: 사람 둘이면 넘길 때 가린다
  const hot = await open(PHONE)
  await hot.getByLabel('닉네임').fill('가람')
  await hot.getByRole('button', { name: '3명' }).click()
  await hot.getByRole('button', { name: '봇', exact: true }).first().click()
  await hot.getByLabel('2번 자리 이름').fill('나래')
  await hot.getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByText('기기를 넘겨 주세요').waitFor()
  await shot(hot, '11-handoff')
  await hot.getByRole('button', { name: /입니다 · 보기$/ }).click()
  await hot.getByText(/차례 · 카드를 고르세요/).waitFor({ timeout: 20_000 })
  await playTurn(hot)
  await hot.getByText('기기를 넘겨 주세요').waitFor({ timeout: 20_000 })
  await hot.getByRole('button', { name: /입니다 · 보기$/ }).click()
  await hot.getByText(/차례 · 카드를 고르세요/).waitFor({ timeout: 20_000 })
  await shot(hot, '12-handoff-next')

  // 봇끼리 관전(한 기기, 모든 자리를 봇으로)
  const bots = await open(PHONE)
  await bots.getByRole('button', { name: '사람', exact: true }).first().click()
  await bots.getByRole('button', { name: '시작', exact: true }).click()
  await bots.getByText(/관전 중/).waitFor()
  assert.equal(await bots.getByLabel('내 손패').count(), 0, '관전은 손패가 없다')
  await shot(bots, '13-bots-watch')

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
  await shot(host, '14-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await guest.getByLabel('시간선').waitFor()
  // 나래 차례가 올 때까지 가람이 둔다
  const until = Date.now() + 60_000
  while (!(await myTurn(guest))) {
    assert.ok(Date.now() < until, '나래 차례가 오지 않음')
    if (await myTurn(host)) await playTurn(host)
    await host.waitForTimeout(200)
  }
  await guest.reload()
  await guest.waitForFunction(() => /내 차례/.test(document.querySelector('[role="status"]')?.textContent ?? ''))
  await shot(guest, '15-online-resumed')
  await playTurn(guest)
  await guest.getByText(/차례를 기다리는 중|생각 중/).first().waitFor()

  // 관전: 방 코드로 들어와 공개 정보만 본다
  const watcher = await open(PHONE)
  await watcher.getByRole('button', { name: '온라인' }).click()
  await watcher.getByLabel(/방 코드/).fill(code)
  await watcher.getByRole('button', { name: '관전' }).click()
  await watcher.getByLabel('시간선').waitFor()
  assert.equal(await watcher.getByLabel('내 손패').count(), 0, '관전자는 손패가 없다')
  await shot(watcher, '16-watch')

  // 끝까지: 두 사람 모두 추리해야 결과가 나온다
  await playToEnd([host, guest])
  await shot(guest, '17-online-result')
  await watcher.getByText(/게임 종료/).waitFor()

  // 규칙
  const rules = await open(PHONE)
  await rules.getByRole('button', { name: '3분 규칙 요약' }).click()
  await shot(rules, '18-rules')
  await rules.getByRole('button', { name: '닫기' }).click()
  await rules.getByRole('button', { name: '전체 룰북' }).click()
  await rules.getByText('왼쪽 최근 사실 규칙').first().waitFor()
  await shot(rules, '19-rulebook')
})
console.log('모바일 확인 통과')
