// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/eleven/)에서 열어 모드를 둔다.
// 1) 한 기기(나 + 봇 3): 임원 드래프트 → 목표 → 이사회 주사위 → 주중 → 경기 준비 4스텝·제출 → 경기 보기·결과·영향 주사위 → 2주차까지,
//    메뉴(알림·봇 속도), 탭(구단·시장·리그·기록), 처음 화면의 이어 하기
// 2) 한 기기 봇끼리 6주 끝까지: 시즌 종료 승점 확인 → 결과 화면
// 3) 온라인(두 기기): 방 만들기 → 초대 링크로 참가 → 대기실 → 시작(빈자리 봇) → 각자 드래프트 → 새로고침 복귀
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 주사위·카드 연출 중간이 찍히지 않게 움직임을 줄인다
const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }

async function setSpeed(page, speed) {
  await page.evaluate((s) => localStorage.setItem('eleven:botSpeed', JSON.stringify(s)), speed)
  await page.reload()
}

const status = (page) => page.locator('header [role="status"]').innerText().catch(() => '')

/** 보이고 누를 수 있으면 누른다 */
async function press(locator) {
  const el = locator.first()
  if (!(await el.isVisible().catch(() => false))) return false
  if (!(await el.isEnabled().catch(() => false))) return false
  await el.click({ timeout: 2000 }).catch(() => {})
  return true
}

/**
 * 내 차례면 지금 단계에서 할 일을 하나 한다(사람이 화면에서 누르는 순서 그대로). 했으면 true
 * 대상 선택 모달 → 확정 막대 → 주사위 트레이 → 단계 패널의 주 버튼 순서로 본다
 */
async function playOne(page) {
  const modal = page.locator('.modal[role="dialog"]')
  if (await modal.first().isVisible().catch(() => false)) {
    const m = modal.first()
    if (await press(m.getByRole('button', { name: /주사위 굴리기|결과 적용/ }))) return true
    await press(m.locator('[role="button"], button.utoken'))
    return press(m.locator('button.primary'))
  }
  if (await press(page.locator('.confirm-bar').getByRole('button', { name: '확정' }))) return true
  if (await press(page.locator('.dice-tray button.primary'))) return true
  const panel = page.locator('.phase-panel')
  if (await press(panel.getByRole('button', { name: /경기 종료로|결과 확인 → /}))) return true
  if (await press(panel.getByRole('button', { name: /^다음: / }))) return true
  if (await press(panel.getByRole('button', { name: '라인업 제출' }))) return true
  if (await press(panel.getByRole('button', { name: '효과 없이 진행' }))) return true
  const pick = panel.locator('.cards [role="button"]')
  if ((await status(page)).includes('고르세요') && (await press(pick))) return true
  // 주중: 기본 행동 없이 차례 끝내기(확정 막대를 거친다) 또는 기본 행동 뒤의 차례 끝내기
  if (await press(page.getByRole('button', { name: /차례 끝내기/ }))) return true
  return false
}

/** 조건이 될 때까지 내 차례를 둔다 */
async function playUntil(page, done, timeout = 240_000, label = '') {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await done()) return
    const mine = (await status(page)).startsWith('내 차례')
    if (mine && (await playOne(page))) await page.waitForTimeout(150)
    else await page.waitForTimeout(250)
  }
  await page.screenshot({ path: path.join(dir, 'shots', 'fail.png') })
  throw new Error(`기다린 화면이 나오지 않았습니다: ${label}`)
}

await withGame(dir, async ({ url, open, shot }) => {
  // ---- 1) 한 기기: 나 + 봇 3 ----
  const solo = await open(PHONE)
  await setSpeed(solo, 'turbo')
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '4명' }).click()
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await solo.getByText('임원 드래프트 1/3').first().waitFor()
  await solo.getByText('내 구단 엠블럼 바꾸기').click()
  await solo.getByRole('radio', { name: /./ }).and(solo.locator('.emblem-option:not([disabled]):not(.chosen)')).first().click()
  await shot(solo, '02-draft')
  await playUntil(solo, async () => (await status(solo)).includes('목표 카드'), 60_000, '목표 카드')
  await shot(solo, '03-objective')
  await playUntil(solo, async () => (await status(solo)).includes('이사회 주사위'), 60_000, '이사회')
  await shot(solo, '04-board')
  await playUntil(solo, async () => (await status(solo)).includes('행동 차례'), 120_000, '주중')
  await shot(solo, '05-weekday')
  await solo.locator('nav.mobile-nav').getByRole('button', { name: '시장' }).click()
  await shot(solo, '06-market')
  await solo.locator('nav.mobile-nav').getByRole('button', { name: '구단' }).click()
  await shot(solo, '07-club')
  await solo.locator('nav.mobile-nav').getByRole('button', { name: '리그' }).click()
  await shot(solo, '08-league')
  await solo.locator('nav.mobile-nav').getByRole('button', { name: '진행' }).click()
  await playUntil(solo, async () => (await status(solo)).includes('라인업'), 120_000, '경기 준비')
  await shot(solo, '09-lineup')
  await playUntil(solo, async () => solo.getByText('경기 보기').first().isVisible(), 120_000, '경기 보기')
  await shot(solo, '10-match')
  await playUntil(solo, async () => (await solo.locator('header').innerText()).includes('2/6주'), 240_000, '2주차')
  await solo.locator('nav.mobile-nav').getByRole('button', { name: '기록' }).click()
  await shot(solo, '11-log')
  await solo.getByRole('button', { name: '메뉴' }).click()
  await shot(solo, '12-menu')
  await solo.getByRole('button', { name: '처음 화면으로' }).click()
  await solo.getByRole('button', { name: '이어 하기' }).click()
  await solo.locator('nav.mobile-nav').waitFor()
  assert.match(await solo.locator('header').innerText(), /2\/6주/)
  await shot(solo, '13-continued')

  // ---- 2) 한 기기 봇끼리 끝까지 ----
  const watch = await open(PHONE)
  await setSpeed(watch, 'turbo')
  await watch.getByRole('button', { name: '3명' }).click()
  await watch.getByRole('button', { name: '사람', exact: true }).click()
  await watch.getByRole('button', { name: '시작', exact: true }).click()
  await watch.getByText(/관전/).first().waitFor()
  await shot(watch, '14-bots')
  await watch.getByText('시즌 종료').first().waitFor({ timeout: 600_000 })
  await watch.getByRole('dialog').first().waitFor()
  await shot(watch, '15-score-review')
  await watch.keyboard.press('Escape')
  await watch.getByRole('button', { name: '항목별 승점 확인' }).waitFor()
  await shot(watch, '16-result')

  // ---- 3) 온라인: 두 기기 ----
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
  await shot(host, '17-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  for (const page of [host, guest]) {
    await page.getByText('임원 드래프트 1/3').first().waitFor()
    await press(page.locator('.phase-panel .cards [role="button"]'))
  }
  await guest.getByText(/기다리는 중|임원 드래프트 2\/3/).first().waitFor()
  await shot(guest, '18-online')
  await guest.reload()
  await guest.locator('nav.mobile-nav').waitFor()
  await shot(guest, '19-online-resumed')
  for (const page of [host, guest]) {
    await page.getByText('임원 드래프트 2/3').first().waitFor()
    await press(page.locator('.phase-panel .cards [role="button"]'))
  }
  await guest.getByText('임원 드래프트 3/3').first().waitFor()
})
console.log('모바일 확인 통과')
