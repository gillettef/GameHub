// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/rootbound/)에서 열어 모든 모드를 둔다.
// 한 기기 AI 대전(공개 단계 → 가져오기 → 타일 고르기 → 칸·방향 → 놓기, 확대 타일, 메뉴 탭, 새로고침 뒤 이어 하기, 끝까지·결과),
// 돌려 하기(가림 화면), 튜토리얼, 온라인(두 기기, 빈자리는 봇, 새로고침 복귀), 관전, 규칙.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const isVisible = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible())
const statusText = async (page) => ((await page.getByRole('status').first().textContent()) ?? '').trim()
const dialog = (page) => page.getByRole('dialog', { name: /(카드|타일) 보기$/ })

/** 펼친 타일 첫 개를 가져온다 */
async function take(page) {
  await page.getByRole('group', { name: /^(마켓|펼친 타일)/ }).getByRole('button').first().click()
  await dialog(page).getByRole('button', { name: /^이 (카드|타일) 가져오기$/ }).click()
}

/** 놓을 수 있는 타일을 골라 첫 칸에 놓는다(놓을 칸이 없으면 버린다) */
async function plant(page, shots) {
  const cards = page.getByRole('list', { name: /^내 (카드|타일)$/ }).getByRole('button')
  const n = await cards.count()
  for (let i = 0; i < n; i++) {
    await cards.nth(i).click()
    const choose = dialog(page).getByRole('button', { name: /^이 (카드|타일) 고르기$/ })
    if (await isVisible(choose)) {
      await choose.click()
      break
    }
    const discard = dialog(page).getByRole('button', { name: /^이 (카드|타일) 버리기$/ })
    if (await isVisible(discard)) return discard.click()
    await dialog(page).getByRole('button', { name: '닫기' }).click()
  }
  await page.getByRole('group', { name: /^(정원|골목) 보드$/ }).getByRole('button').first().click()
  await shots?.(page)
  await page.getByRole('button', { name: '놓기', exact: true }).click()
}

/** 내 차례면 한 단계(가림 화면·확인·가져오기·놓기)를 두고 true */
async function step(page) {
  const handoff = page.getByRole('dialog').getByRole('button', { name: '시작', exact: true })
  if (await isVisible(handoff)) return handoff.click().then(() => true)
  const confirm = page.getByRole('button', { name: /^확인(하고 시작)?$/ })
  if (await isVisible(confirm)) return confirm.click().then(() => true)
  const s = await statusText(page)
  if (s.startsWith('내 차례 · 타일 가져오기')) return take(page).then(() => true)
  if (s.startsWith('내 차례 · 명당 놓기')) return plant(page).then(() => true)
  return false
}

/** 결과가 나올 때까지 내 차례마다 둔다 */
async function playToEnd(page, timeout = 240_000) {
  const until = Date.now() + timeout
  while (!(await isVisible(page.getByRole('dialog').getByText(/게임 종료 ·/)))) {
    assert.ok(Date.now() < until, '게임이 끝나지 않음')
    const before = await statusText(page)
    if (!(await step(page))) {
      await page.waitForTimeout(150)
      continue
    }
    await page.waitForFunction((b) => (document.querySelector('[role="status"]')?.textContent ?? '').trim() !== b, before, { timeout: 15_000 }).catch(() => {})
  }
}

await withGame(dir, async ({ url, open, shot }) => {
  // 처음 화면
  const solo = await open(PHONE)
  await shot(solo, '01-home')

  // 한 기기 AI 대전 3인: 공개 단계
  await solo.getByLabel('닉네임').fill('가람')
  await solo.getByRole('button', { name: '3명' }).click()
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await solo.getByText('이번 판 명당 확인').waitFor()
  await shot(solo, '02-reveal')
  await solo.getByRole('button', { name: '확인하고 시작' }).click()
  await solo.getByText('내 차례 · 타일 가져오기').waitFor()
  await shot(solo, '03-take')
  // 확대 타일(펼친 타일) → 가져오기
  await solo.getByRole('group', { name: /^(마켓|펼친 타일)/ }).getByRole('button').first().click()
  await shot(solo, '04-market-card')
  await dialog(solo).getByRole('button', { name: /^이 (카드|타일) 가져오기$/ }).click()
  await solo.getByText('내 차례 · 명당 놓기').waitFor()
  await shot(solo, '05-plant')
  await plant(solo, (p) => shot(p, '06-plant-preview'))
  await solo.getByText(/AI \d의 차례/).first().waitFor()
  await shot(solo, '07-bot-turn')
  // 메뉴: 점수·진행·타일·설명 탭
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByRole('tab', { name: '점수' }).waitFor()
  await shot(solo, '08-menu-score')
  await solo.getByRole('tab', { name: '진행' }).click()
  await shot(solo, '09-menu-log')
  await solo.getByRole('tab', { name: '타일' }).click()
  await shot(solo, '10-menu-cards')
  await solo.getByRole('dialog', { name: '메뉴' }).getByRole('button', { name: '닫기' }).click()
  await solo.getByText('내 차례 · 타일 가져오기').waitFor({ timeout: 20_000 })

  // 새로고침해도 처음 화면의 '이어 하기'로 같은 판에 돌아온다
  await solo.reload()
  await solo.getByRole('button', { name: /이어 하기 \(\d+라운드\)/ }).click()
  await solo.getByText('내 차례 · 타일 가져오기').waitFor()
  await playToEnd(solo)
  await shot(solo, '11-result')
  await solo.getByRole('button', { name: '보드 살펴보기' }).click()
  await shot(solo, '12-final-board')
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByRole('button', { name: '나가기' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByRole('button', { name: '나가기' }).last().click()
  await solo.getByRole('button', { name: '방 만들기' }).or(solo.getByRole('button', { name: '시작', exact: true })).first().waitFor()
  assert.equal(await solo.getByRole('button', { name: /이어 하기/ }).count(), 0, '끝난 판은 이어 하기에 없다')

  // 한 기기 돌려 하기: 사람 둘. 차례가 바뀌면 가린다
  const hot = await open(PHONE)
  await hot.getByLabel('닉네임').fill('가람')
  await hot.getByRole('button', { name: '봇', exact: true }).first().click()
  await hot.getByLabel('2번 자리 이름').fill('나래')
  await hot.getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByRole('button', { name: '확인하고 시작' }).click()
  await take(hot)
  await plant(hot)
  await hot.getByRole('dialog').getByText('나래의 차례').waitFor()
  await shot(hot, '13-handoff')
  assert.equal(await hot.getByRole('list', { name: /^내 (카드|타일)$/ }).count(), 1)
  await hot.getByRole('dialog').getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByText('내 차례 · 타일 가져오기').waitFor()
  await shot(hot, '14-handoff-next')

  // 튜토리얼
  const tut = await open(PHONE)
  await tut.getByRole('button', { name: /튜토리얼/ }).click()
  await tut.getByRole('button', { name: '확인하고 시작' }).click()
  await tut.getByText('내 차례 · 타일 가져오기').waitFor()
  await shot(tut, '15-tutorial')

  // 온라인: 두 기기, 빈자리는 봇(3인). 새로고침해도 자리로 돌아온다
  const host = await open(BROWSER)
  await host.getByRole('button', { name: '온라인' }).click()
  await host.getByLabel('닉네임').fill('가람')
  await host.getByRole('button', { name: '3명' }).click()
  await host.getByRole('button', { name: '1분' }).click()
  await host.getByRole('button', { name: '방 만들기' }).click()
  const code = (await host.getByTestId('room-code').innerText()).trim()
  assert.match(code, /^[A-Z2-9]{4}$/)
  const guest = await open(PHONE)
  await guest.goto(`${url}?room=${code}`)
  await guest.getByLabel('닉네임').fill('나래')
  await guest.getByRole('button', { name: '참가' }).click()
  await host.getByText('나래').waitFor()
  await shot(host, '16-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await host.getByRole('button', { name: '확인', exact: true }).click()
  await host.getByText(/확인 기다리는 중/).waitFor()
  await shot(host, '17-online-reveal-wait')
  await guest.reload()
  await guest.getByRole('button', { name: '확인', exact: true }).click()
  await host.getByText('내 차례 · 타일 가져오기').waitFor()
  await host.getByRole('timer').waitFor()
  await shot(host, '18-online-turn')
  await take(host)
  await plant(host)
  await guest.getByText('내 차례 · 타일 가져오기').or(guest.getByText(/AI \d의 차례/)).first().waitFor()
  await guest.reload()
  await guest.getByText(/의 차례|내 차례/).first().waitFor()
  await shot(guest, '19-online-resumed')
  // 손 타일은 내 것만 보인다
  assert.equal(await guest.getByRole('list', { name: /^내 (카드|타일)$/ }).getByRole('button').count(), 1 + ((await statusText(guest)).startsWith('내 차례 · 명당 놓기') ? 1 : 0))

  // 관전: 방 코드로 들어와 공개 정보만 본다
  const watcher = await open(PHONE)
  await watcher.getByRole('button', { name: '온라인' }).click()
  await watcher.getByLabel(/방 코드/).fill(code)
  await watcher.getByRole('button', { name: '관전' }).click()
  await watcher.getByText('관전 중입니다').waitFor()
  assert.equal(await watcher.getByRole('list', { name: /^내 (카드|타일)$/ }).count(), 0, '관전자는 손 타일이 없다')
  await shot(watcher, '20-watch')

  // 규칙
  const rules = await open(PHONE)
  await rules.getByRole('button', { name: '게임 규칙' }).click()
  await rules.getByRole('dialog', { name: '게임 규칙' }).waitFor()
  await shot(rules, '21-rules')
})
console.log('모바일 확인 통과')
