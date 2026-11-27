// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/nyangalley/)에서 열어 모든 모드를 둔다.
// v8 「행동 하나」 흐름: 한 기기 AI 대전(공개 단계·무리 고르기 → 행동 고르기 판 → 가져오기 두 개 → 다음 차례 놓기 → 칸·방향 → 놓기, 확대 타일,
// 메뉴 탭, 새로고침 뒤 이어 하기, 끝까지 두며 명당 부르기 장면, 결과), 돌려 하기(가림 화면), 튜토리얼, 온라인(두 기기, 빈자리는 봇,
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
/** 지금 라운드 (① 보조 줄 "N/20라운드") */
const handCards = (page) => page.getByRole('list', { name: /^내 (카드|타일)$/ }).getByRole('button')
/** 행동 고르기 단계 (① 상태바) */
const ACT = '내 차례 · 행동 고르기'
/** 가져오기 두 번째 타일 (① 상태바) */
const TAKE_MORE = '내 차례 · 타일 1개 더 가져오기'

/** ④ 행동 고르기 판 */
const chooser = (page) => page.getByRole('group', { name: '이번 차례 행동 고르기' })
/** 행동 고르기 판이 떠 있으면 그 행동(이름 앞부분)을 누른다. 누를 수 없으면 false */
async function choose(page, name) {
  if (!(await isVisible(chooser(page)))) return true
  const button = chooser(page).getByRole('button', { name })
  if ((await button.count()) === 0 || !(await button.first().isEnabled())) return false
  await button.first().click()
  return true
}

/** 펼친 타일 첫 개를 가져온다(행동 고르기 판이면 먼저 가져오기를 고른다) */
async function take(page) {
  await choose(page, /가져오기/)
  await page.getByRole('group', { name: /^(마켓|펼친 타일)/ }).getByRole('button').first().click()
  await dialog(page).getByRole('button', { name: /^이 (카드|타일) 가져오기$/ }).click()
}

/** 놓을 수 있는 타일을 골라 첫 칸에 놓는다(놓을 칸이 없으면 버린다). 행동 고르기 판이면 먼저 놓기를 고른다 */
async function plant(page, shots) {
  await choose(page, /명당 놓기|타일 버리기/)
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

/** 명당 부르기: 보드의 첫 명당 칸(부를 수 있는 내 칸 위 명당) → (방향은 그대로) → 부르기. 부를 명당이 없으면 false */
async function call(page, shots) {
  if (!(await choose(page, /명당 부르기/))) return false
  const spots = board(page).getByRole('button', { name: / · 명당 / })
  if ((await spots.count()) === 0) return false
  await spots.first().click()
  await shots?.(page, 'call-preview')
  await page.getByRole('button', { name: '부르기', exact: true }).click()
  return true
}

/**
 * 내 차례면 한 단계(가림 화면·확인·가져오기·놓기·부르기)를 두고 true. 손이 비면 가져오고, 아니면 놓는다.
 * scenes: 아직 찍지 않은 명당 부르기 장면이 있고 부를 명당이 있으면 부른다
 */
async function step(page, scenes) {
  const handoff = page.getByRole('dialog').getByRole('button', { name: '시작', exact: true })
  if (await isVisible(handoff)) return handoff.click().then(() => true)
  const confirm = page.getByRole('button', { name: /^확인/ })
  if (await isVisible(confirm)) return confirm.click().then(() => true)
  const s = await statusText(page)
  if (s.startsWith(TAKE_MORE)) return take(page).then(() => true)
  if (s.startsWith(ACT)) {
    if (scenes && !scenes.call.done) {
      if (await call(page, (p, n) => scenes.shot(p, n))) {
        scenes.call.done = true
        return true
      }
    }
    const canTake = await chooser(page).getByRole('button', { name: /가져오기/ }).isEnabled()
    if ((await handCards(page).count()) === 0) {
      if (canTake) return take(page).then(() => true)
      // 타일이 다 떨어지면 부를 명당만 남는다
      return call(page)
    }
    return plant(page).then(() => true)
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
  // 무리 고르기: 고등어냥
  await solo.getByRole('radiogroup', { name: '고양이 무리 고르기' }).getByRole('radio', { name: /고등어냥/ }).click()
  await solo.getByRole('radio', { name: /고등어냥/, checked: true }).waitFor()
  await shot(solo, '02-reveal-crew')
  await solo.getByRole('button', { name: '확인하고 시작' }).click()
  // 1라운드 행동 고르기(내가 선): 손 1개, 펼친 타일 2개
  await solo.getByText(ACT).first().waitFor()
  assert.equal(await handCards(solo).count(), 1, '처음 손 타일은 1개')
  await shot(solo, '03-act')
  // 내 칩은 고른 무리(고등어냥)
  assert.ok((await solo.getByRole('group', { name: '골목 보드' }).getByRole('button').count()) === 0, '행동을 고르기 전에는 보드 칸을 누를 수 없다')
  // 가져오기를 고르면 펼친 타일 화면 → 확대 타일 → 가져오기 → 두 번째는 주머니에서
  await chooser(solo).getByRole('button', { name: /가져오기/ }).click()
  await solo.getByText('내 차례 · 타일 가져오기').first().waitFor()
  await shot(solo, '03-take-mode')
  await solo.getByRole('group', { name: /^(마켓|펼친 타일)/ }).getByRole('button').first().click()
  await shot(solo, '04-market-card')
  await dialog(solo).getByRole('button', { name: /^이 (카드|타일) 가져오기$/ }).click()
  await solo.getByText(TAKE_MORE).first().waitFor()
  await shot(solo, '05-take-more')
  await solo.getByRole('button', { name: '주머니에서 1개 더' }).click()
  await dialog(solo).getByRole('button', { name: '주머니에서 1개 꺼내기' }).click()
  await solo.getByText(/AI \d의 차례/).first().waitFor()
  await shot(solo, '06-bot-turn')
  // 다음 차례: 손 3개 → 놓기
  await solo.getByText(ACT).first().waitFor({ timeout: 20_000 })
  assert.equal(await handCards(solo).count(), 3, '가져오기 두 개 뒤 손 타일 3개')
  await shot(solo, '07-act-full-hand')
  await chooser(solo).getByRole('button', { name: /명당 놓기/ }).click()
  await solo.getByText('내 차례 · 명당 놓기').first().waitFor()
  await handCards(solo).first().click()
  await shot(solo, '08-hand-card')
  await dialog(solo).getByRole('button', { name: '닫기' }).click()
  await plant(solo, (p) => shot(p, '09-plant-preview'))
  await solo.waitForFunction(() => !(document.querySelector('[role="status"]')?.textContent ?? '').includes('명당 놓기'), undefined, { timeout: 15_000 }).catch(() => {})
  console.log('놓은 뒤:', await statusText(solo))
  await shot(solo, '10-after-plant')
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
  // 끝까지 두며 명당 부르기 장면을 찍는다
  const scenes = {
    call: { done: false },
    shot: (p) => shot(p, '17-call'),
  }
  await playToEnd(solo, scenes)
  assert.ok(scenes.call.done, '명당 부르기 장면을 찍지 못함')
  await shot(solo, '18-result')
  await solo.getByRole('button', { name: '보드 살펴보기' }).click()
  await shot(solo, '19-final-board')
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
  await hot.getByRole('radio', { name: /턱시도냥/ }).click()
  await hot.getByRole('button', { name: '확인 · 다음 나래' }).click()
  // 나래 차례: 가람이 고른 턱시도냥은 고를 수 없다
  await hot.getByText('나래의 고양이 무리').waitFor()
  assert.ok(await hot.getByRole('radio', { name: /턱시도냥/ }).isDisabled(), '남이 고른 무리는 고를 수 없다')
  await shot(hot, '20-hotseat-crew')
  await hot.getByRole('radio', { name: /^랜덤/ }).click()
  await hot.getByRole('button', { name: '확인하고 시작' }).click()
  // 1라운드가 열리면 가람에게 넘긴다
  await hot.getByRole('dialog').getByText('가람의 차례').waitFor()
  await hot.getByRole('dialog').getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByText(ACT).first().waitFor()
  await plant(hot)
  await hot.getByRole('dialog').getByText('나래의 차례').waitFor()
  await shot(hot, '20-handoff-next-player')
  assert.equal(await hot.getByRole('list', { name: /^내 (카드|타일)$/ }).count(), 1)
  await hot.getByRole('dialog').getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByText(ACT).first().waitFor()
  await shot(hot, '21-handoff-next')

  // 튜토리얼
  const tut = await open(PHONE)
  await tut.getByRole('button', { name: /튜토리얼/ }).click()
  await tut.getByRole('button', { name: '확인하고 시작' }).click()
  await tut.getByText(ACT).first().waitFor()
  await shot(tut, '22-tutorial')
  await tut.getByRole('button', { name: '다음', exact: true }).click()
  await tut.getByText('차례마다 하나만', { exact: true }).waitFor()
  await shot(tut, '23-tutorial-act')

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
  await host.getByText(ACT).first().waitFor()
  await host.getByRole('timer').waitFor()
  await shot(host, '26-online-turn')
  await take(host)
  await host.getByText(TAKE_MORE).first().waitFor()
  await take(host)
  await guest.getByText(ACT).or(guest.getByText(/AI \d의 차례/)).first().waitFor()
  await guest.reload()
  await guest.getByText(/의 차례|내 차례/).first().waitFor()
  await shot(guest, '27-online-resumed')
  // 손 타일은 내 것만 보인다
  assert.equal(await handCards(guest).count(), 1 + ((await statusText(guest)).startsWith(TAKE_MORE) ? 1 : 0))

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
