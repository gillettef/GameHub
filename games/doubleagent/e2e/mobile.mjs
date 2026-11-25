// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/doubleagent/)에서 열어 모든 모드를 둔다.
// 한 기기 AI 대전(선수·구단·카드 고르기, 확대 카드, 결과, 메뉴, 새로고침 뒤 이어 하기, 끝까지), 돌려 하기(가림 화면),
// 온라인(두 기기, 빈자리는 봇, 새로고침 복귀), 관전, 규칙.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const isVisible = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible())
const status = (page) => page.getByRole('status').first()
const myBid = (page) => page.getByText(/차례 · 1·2차 협상 작성/).first()

/** 지금 협상 차수에서 계약할 수 있는 선수·구단을 고른다. 고르면 true */
async function pickOffer(page, ready) {
  const players = page.getByRole('button', { name: /^선수 / })
  const clubs = page.getByRole('button', { name: /^구단 / })
  const np = await players.count()
  const nc = await clubs.count()
  for (let i = 0; i < np; i++) {
    if (!(await players.nth(i).isEnabled())) continue
    await players.nth(i).click()
    for (let j = 0; j < nc; j++) {
      if (!(await clubs.nth(j).isEnabled())) continue
      await clubs.nth(j).click()
      if (await ready().isEnabled()) return true
    }
  }
  return false
}

/** 내 제안 하나를 낸다: 1차·2차 모두 계약 가능한 수를 고르고, 없으면 패스 */
async function playBid(page) {
  const next = () => page.getByRole('button', { name: '2차 협상 작성 →' })
  if (!(await pickOffer(page, next))) await page.getByRole('button', { name: '1차 패스' }).click()
  else await next().click()
  const submit = () => page.getByRole('button', { name: '제출', exact: true })
  if (await pickOffer(page, submit)) return submit().click()
  await page.getByRole('button', { name: '2차 패스' }).click()
  await page.getByRole('dialog', { name: '확인' }).getByRole('button', { name: /패스/ }).click()
}

/** 결과까지 내 차례마다 둔다 */
async function playToEnd(page, timeout = 120_000) {
  const until = Date.now() + timeout
  while (!(await isVisible(page.getByText('이적시장 마감 · 최종 결과')))) {
    assert.ok(Date.now() < until, '게임이 끝나지 않음')
    const before = await status(page).innerText()
    if (await isVisible(myBid(page))) await playBid(page)
    else if (await isVisible(page.getByRole('button', { name: /다음 라운드 →|최종 결과 →/ }))) await page.getByRole('button', { name: /다음 라운드 →|최종 결과 →/ }).click()
    else if (await isVisible(page.getByRole('button', { name: /입니다 · 시작$/ }))) await page.getByRole('button', { name: /입니다 · 시작$/ }).click()
    else {
      await page.waitForTimeout(150)
      continue
    }
    await page.waitForFunction((b) => document.querySelector('[role="status"]')?.textContent !== b, before, { timeout: 15_000 }).catch(() => {})
  }
}

await withGame(dir, async ({ url, open, shot }) => {
  // 처음 화면
  const solo = await open(PHONE)
  await shot(solo, '01-home')

  // 한 기기 AI 대전 3인: 선수 → 구단 → 카드, 확대 카드, 2차, 제출
  await solo.getByLabel('닉네임').fill('가람')
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await myBid(solo).waitFor()
  await shot(solo, '02-bid')
  assert.ok(await pickOffer(solo, () => solo.getByRole('button', { name: '2차 협상 작성 →' })), '계약할 수 있는 수가 있어야 한다')
  await solo.getByRole('button', { name: /^요구 수수료 \+3억/ }).click()
  await shot(solo, '03-bid-picked')
  await solo.getByRole('button', { name: /카드 크게 보기$/ }).first().click()
  await shot(solo, '04-zoom')
  await solo.getByRole('button', { name: '닫기' }).click()
  await solo.getByRole('button', { name: '2차 협상 작성 →' }).click()
  await shot(solo, '05-stage2')
  await solo.getByRole('button', { name: '2차 패스' }).click()
  await solo.getByRole('dialog', { name: '확인' }).getByRole('button', { name: '2차 패스하고 제출' }).click()
  await solo.getByRole('button', { name: '다음 라운드 →' }).waitFor()
  await shot(solo, '06-result')
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('dialog', { name: '메뉴' }).getByText('라운드별 결과').waitFor()
  await shot(solo, '07-menu')
  await solo.getByRole('button', { name: '닫기' }).click()
  await solo.getByRole('button', { name: /AI 알파/ }).first().click()
  await shot(solo, '08-agent')
  await solo.getByRole('button', { name: '닫기' }).click()
  await solo.getByRole('button', { name: '다음 라운드 →' }).click()
  await myBid(solo).waitFor()
  await solo.getByText('라운드 2/5', { exact: false }).first().waitFor()

  // 새로고침해도 처음 화면의 '이어 하기'로 같은 판에 돌아온다
  await solo.reload()
  await solo.getByRole('button', { name: /이어 하기 \(라운드 2\/5\)/ }).click()
  await myBid(solo).waitFor()
  await playToEnd(solo)
  await shot(solo, '09-final')
  await solo.getByRole('button', { name: '처음으로' }).click()
  await solo.getByLabel('내 전적').getByText(/1위|2위|3위/).first().waitFor()
  assert.equal(await solo.getByRole('button', { name: /이어 하기/ }).count(), 0, '끝난 판은 이어 하기에 없다')
  await shot(solo, '10-home-stats')

  // 한 기기 돌려 하기: 사람 둘 + AI 하나. 제안을 쓸 사람이 바뀔 때 가린다
  const hot = await open(PHONE)
  await hot.getByLabel('닉네임').fill('가람')
  await hot.getByRole('button', { name: '봇', exact: true }).first().click()
  await hot.getByLabel('2번 자리 이름').fill('나래')
  await hot.getByRole('button', { name: '시작', exact: true }).click()
  await hot.getByText('가람 님 차례').waitFor()
  await shot(hot, '11-handoff')
  await hot.getByRole('button', { name: '제가 가람입니다 · 시작' }).click()
  await playBid(hot)
  await hot.getByText('나래 님 차례').waitFor()
  await hot.getByRole('button', { name: '제가 나래입니다 · 시작' }).click()
  await myBid(hot).waitFor()
  await shot(hot, '12-handoff-next')
  await playBid(hot)
  await hot.getByRole('button', { name: '다음 라운드 →' }).waitFor()
  assert.equal(await hot.getByLabel('나의 목표 카드').count(), 0, '돌려 하기 결과 화면에는 목표 카드를 보이지 않는다')
  await shot(hot, '13-hotseat-result')
  await hot.getByRole('button', { name: '다음 라운드 →' }).click()
  await hot.getByText('가람 님 차례').waitFor()

  // 온라인: 두 기기, 빈자리는 봇. 새로고침해도 자리로 돌아온다
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
  await shot(host, '14-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await myBid(guest).waitFor()
  await myBid(host).waitFor()
  await playBid(host)
  await host.getByText(/제출 완료 · 기다리는 중/).waitFor()
  await shot(host, '15-online-submitted')
  await guest.reload()
  await myBid(guest).waitFor()
  await shot(guest, '16-online-resumed')
  await playBid(guest)
  await guest.getByRole('button', { name: '다음 라운드 →' }).waitFor()
  await host.getByRole('button', { name: '다음 라운드 →' }).click()
  await host.getByText(/기다리는 중/).first().waitFor()
  await guest.getByRole('button', { name: '다음 라운드 →' }).click()
  await myBid(host).waitFor()
  await myBid(guest).waitFor()

  // 관전: 방 코드로 들어와 공개 정보만 본다
  const watcher = await open(PHONE)
  await watcher.getByRole('button', { name: '온라인' }).click()
  await watcher.getByLabel(/방 코드/).fill(code)
  await watcher.getByRole('button', { name: '관전' }).click()
  await watcher.getByText(/관전 중/).first().waitFor()
  assert.equal(await watcher.getByLabel('나의 목표 카드').count(), 0, '관전자는 목표 카드가 없다')
  await shot(watcher, '17-watch')

  // 규칙
  const rules = await open(PHONE)
  await rules.getByRole('button', { name: '게임 규칙' }).click()
  await rules.getByRole('dialog', { name: '게임 규칙' }).getByText('한 줄 요약').waitFor()
  await shot(rules, '18-rules')
})
console.log('모바일 확인 통과')
