// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/nyangalley/)에서 열어 모든 모드를 둔다.
// v7 「골목 일과」 흐름: 한 기기 AI 대전(공개 단계 → 일과 고르기 → 가져오기 → 타일 고르기 → 칸·방향 → 놓기, 확대 타일, 메뉴 탭,
// 새로고침 뒤 이어 하기, 끝까지 두며 담 넘기·명당 부르기 장면, 결과), 돌려 하기(가림 화면), 튜토리얼, 온라인(두 기기, 빈자리는 봇,
// 새로고침 복귀), 관전, 규칙.
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
const board = (page) => page.getByRole('group', { name: /^(정원|골목) 보드$/ })
/** 지금 라운드 (① 보조 줄 "N/12라운드") */
const roundOf = async (page) => Number(((await page.locator('body').innerText()).match(/(\d+)\/\d+라운드/) ?? [])[1] ?? 0)

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
  await board(page).getByRole('button').first().click()
  await shots?.(page)
  await page.getByRole('button', { name: '놓기', exact: true }).click()
}

/**
 * 일과 고르기: want 에 든 일과 이름 중 남은 첫 일과, 없으면 명당을 놓는 첫 일과(없으면 남은 첫 일과)를 눌러 고른다.
 * shot 이 있으면 누른 뒤(설명이 보일 때) 찍는다. 고른 일과 이름을 돌려준다
 */
async function pickChore(page, want = [], shot) {
  const cards = page.getByRole('group', { name: /^골목 일과/ }).getByRole('button', { disabled: false })
  const labels = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
  let i = labels.findIndex((l) => want.some((w) => l.startsWith(`${w} (`)))
  if (i < 0) i = labels.findIndex((l) => l.includes('(놓기)'))
  if (i < 0) i = 0
  await cards.nth(i).click()
  await shot?.(page)
  const name = labels[i].split(' (')[0]
  await page.getByRole('button', { name: `「${name}」 고르기` }).click()
  return name
}

/** 담 넘기: 출발 칸 → 도착 칸, 한 번 더 옮기기 → 출발 칸 → 도착 칸 → 이대로 끝내기 */
async function move(page, shots) {
  await board(page).getByRole('button').first().click()
  await board(page).getByRole('button').first().click()
  await shots?.(page, 'move-preview')
  const again = page.getByRole('button', { name: '한 번 더 옮기기' })
  if (await isVisible(again)) {
    await again.click()
    if ((await board(page).getByRole('button').count()) > 0) {
      await board(page).getByRole('button').first().click()
      await board(page).getByRole('button').first().click()
      await shots?.(page, 'move-second')
    }
  }
  await page.getByRole('button', { name: '이대로 끝내기' }).click()
}

/** 명당 부르기: 첫 명당 → (방향은 그대로) → 가져올 펼친 타일 → 부르기 */
async function call(page, shots) {
  await board(page).getByRole('button').first().click()
  const takeCards = page.getByRole('group', { name: '가져올 펼친 타일' }).getByRole('button')
  if ((await takeCards.count()) > 0) await takeCards.first().click()
  await shots?.(page, 'call-preview')
  await page.getByRole('button', { name: '부르기', exact: true }).click()
}

/**
 * 내 차례면 한 단계(가림 화면·확인·일과·가져오기·놓기·담 넘기·부르기)를 두고 true.
 * scenes: 아직 찍지 않은 장면(담 넘기·명당 부르기)이 있으면 그 일과를 골라 찍는다
 */
async function step(page, scenes) {
  const handoff = page.getByRole('dialog').getByRole('button', { name: '시작', exact: true })
  if (await isVisible(handoff)) return handoff.click().then(() => true)
  const confirm = page.getByRole('button', { name: /^확인(하고 시작)?$/ })
  if (await isVisible(confirm)) return confirm.click().then(() => true)
  const s = await statusText(page)
  if (s.startsWith('내 차례 · 일과 고르기')) {
    const want = []
    if (scenes && !scenes.move.done) want.push('담 넘기')
    // 부를 명당이 생길 만한 3라운드부터 명당 부르기를 고른다(부를 명당이 없으면 그 차례는 쉰다)
    if (scenes && !scenes.call.done && (await roundOf(page)) >= 3) want.push('명당 부르기')
    return pickChore(page, want).then(() => true)
  }
  if (s.startsWith('내 차례 · 타일 가져오기')) return take(page).then(() => true)
  if (s.startsWith('내 차례 · 명당 놓기')) return plant(page).then(() => true)
  if (s.startsWith('내 차례 · 담 넘기')) {
    const shoot = scenes && !scenes.move.done ? (p, n) => scenes.shot(p, n) : undefined
    if (scenes) scenes.move.done = true
    return move(page, shoot).then(() => true)
  }
  if (s.startsWith('내 차례 · 명당 부르기')) {
    const shoot = scenes && !scenes.call.done ? (p, n) => scenes.shot(p, n) : undefined
    if (scenes) scenes.call.done = true
    return call(page, shoot).then(() => true)
  }
  return false
}

/** 결과가 나올 때까지 내 차례마다 둔다 */
async function playToEnd(page, scenes, timeout = 300_000) {
  const until = Date.now() + timeout
  while (!(await isVisible(page.getByRole('dialog').getByText(/게임 종료 ·/)))) {
    assert.ok(Date.now() < until, '게임이 끝나지 않음')
    const before = await statusText(page)
    if (!(await step(page, scenes))) {
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
  // 1라운드 일과 고르기(내가 선): 펼친 일과 4장
  await solo.getByText('내 차례 · 일과 고르기').first().waitFor()
  assert.equal(await solo.getByRole('group', { name: /^골목 일과/ }).getByRole('button').count(), 4, '3인은 일과 4장을 펼친다')
  await shot(solo, '03-chore')
  await pickChore(solo, ['식빵 굽기', '마실', '대장 방울'], (p) => shot(p, '04-chore-picked'))
  // AI 둘이 고르는 동안
  await solo.getByText(/AI \d의 차례 · 일과 고르는 중/).first().waitFor()
  await shot(solo, '05-chore-others')
  await solo.getByText('내 차례 · 타일 가져오기').first().waitFor({ timeout: 20_000 })
  await shot(solo, '06-take')
  // 확대 타일(펼친 타일) → 가져오기
  await solo.getByRole('group', { name: /^(마켓|펼친 타일)/ }).getByRole('button').first().click()
  await shot(solo, '07-market-card')
  await dialog(solo).getByRole('button', { name: /^이 (카드|타일) 가져오기$/ }).click()
  await solo.getByText('내 차례 · 명당 놓기').first().waitFor()
  await shot(solo, '08-plant')
  await plant(solo, (p) => shot(p, '09-plant-preview'))
  await solo.getByText(/AI \d의 차례/).first().waitFor()
  await shot(solo, '10-bot-turn')
  // 메뉴: 점수·진행·타일·설명 탭
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByRole('tab', { name: '점수' }).waitFor()
  await shot(solo, '11-menu-score')
  await solo.getByRole('tab', { name: '진행' }).click()
  await shot(solo, '12-menu-log')
  await solo.getByRole('tab', { name: '타일' }).click()
  await shot(solo, '13-menu-cards')
  await solo.getByRole('tab', { name: '설명' }).click()
  await shot(solo, '14-menu-help')
  await solo.getByRole('dialog', { name: '메뉴' }).getByRole('button', { name: '닫기' }).click()
  await solo.getByText(/^내 차례 · /).first().waitFor({ timeout: 20_000 })

  // 새로고침해도 처음 화면의 '이어 하기'로 같은 판에 돌아온다
  await solo.reload()
  await solo.getByRole('button', { name: /이어 하기 \(\d+라운드\)/ }).click()
  await solo.getByText(/^내 차례 · /).first().waitFor()
  // 끝까지 두며 담 넘기·명당 부르기 장면을 찍는다
  const scenes = {
    move: { done: false },
    call: { done: false },
    shot: (p, name) => shot(p, name === 'move-preview' ? '15-move' : name === 'move-second' ? '16-move-second' : '17-call'),
  }
  await playToEnd(solo, scenes)
  assert.ok(scenes.move.done, '담 넘기 장면을 찍지 못함')
  assert.ok(scenes.call.done, '명당 부르기 장면을 찍지 못함')
  await shot(solo, '18-result')
  await solo.getByRole('button', { name: '보드 살펴보기' }).click()
  await shot(solo, '19-final-board')
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByRole('button', { name: '나가기' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByRole('button', { name: '나가기' }).last().click()
  await solo.getByRole('button', { name: '방 만들기' }).or(solo.getByRole('button', { name: '시작', exact: true })).first().waitFor()
  assert.equal(await solo.getByRole('button', { name: /이어 하기/ }).count(), 0, '끝난 판은 이어 하기에 없다')

  // 한 기기 돌려 하기: 사람 둘. 차례가 바뀌면 가린다(일과 고르기도 다음 사람에게 넘긴다)
  const hot = await open(PHONE)
  await hot.getByLabel('닉네임').fill('가람')
  await hot.getByRole('button', { name: '봇', exact: true }).first().click()
  await hot.getByLabel('2번 자리 이름').fill('나래')
  await hot.getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByRole('button', { name: '확인하고 시작' }).click()
  await hot.getByText('내 차례 · 일과 고르기').first().waitFor()
  await pickChore(hot)
  await hot.getByRole('dialog').getByText('나래의 차례').waitFor()
  await shot(hot, '20-handoff')
  assert.equal(await hot.getByRole('list', { name: /^내 (카드|타일)$/ }).count(), 1)
  await hot.getByRole('dialog').getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByText('내 차례 · 일과 고르기').first().waitFor()
  await shot(hot, '21-handoff-next')

  // 튜토리얼
  const tut = await open(PHONE)
  await tut.getByRole('button', { name: /튜토리얼/ }).click()
  await tut.getByRole('button', { name: '확인하고 시작' }).click()
  await tut.getByText('내 차례 · 일과 고르기').first().waitFor()
  await shot(tut, '22-tutorial')
  await tut.getByRole('button', { name: '다음', exact: true }).click()
  await tut.getByText('일과 고르기', { exact: true }).waitFor()
  await shot(tut, '23-tutorial-chore')

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
  await shot(host, '24-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await host.getByRole('button', { name: '확인', exact: true }).click()
  await host.getByText(/확인 기다리는 중/).waitFor()
  await shot(host, '25-online-reveal-wait')
  await guest.reload()
  await guest.getByRole('button', { name: '확인', exact: true }).click()
  await host.getByText('내 차례 · 일과 고르기').first().waitFor()
  await host.getByRole('timer').waitFor()
  await shot(host, '26-online-turn')
  await pickChore(host)
  await guest.getByText('내 차례 · 일과 고르기').first().waitFor()
  await pickChore(guest)
  await host.getByText('내 차례 · 타일 가져오기').first().waitFor({ timeout: 20_000 })
  await take(host)
  await plant(host)
  await guest.getByText('내 차례 · 타일 가져오기').or(guest.getByText(/AI \d의 차례/)).first().waitFor()
  await guest.reload()
  await guest.getByText(/의 차례|내 차례/).first().waitFor()
  await shot(guest, '27-online-resumed')
  // 손 타일은 내 것만 보인다
  assert.equal(await guest.getByRole('list', { name: /^내 (카드|타일)$/ }).getByRole('button').count(), 1 + ((await statusText(guest)).startsWith('내 차례 · 명당 놓기') ? 1 : 0))

  // 관전: 방 코드로 들어와 공개 정보만 본다
  const watcher = await open(PHONE)
  await watcher.getByRole('button', { name: '온라인' }).click()
  await watcher.getByLabel(/방 코드/).fill(code)
  await watcher.getByRole('button', { name: '관전' }).click()
  await watcher.getByText('관전 중입니다').waitFor()
  assert.equal(await watcher.getByRole('list', { name: /^내 (카드|타일)$/ }).count(), 0, '관전자는 손 타일이 없다')
  await shot(watcher, '28-watch')

  // 규칙
  const rules = await open(PHONE)
  await rules.getByRole('button', { name: '게임 규칙' }).click()
  await rules.getByRole('dialog', { name: '게임 규칙' }).waitFor()
  await shot(rules, '29-rules')
})
console.log('모바일 확인 통과')
