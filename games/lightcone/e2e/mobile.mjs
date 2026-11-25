// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/lightcone/)에서 열어 모든 모드를 둔다.
// 나 vs 봇(지도에서 이동 고르기 → 공격 → 점령, 끝까지, 봇 실체 보기, 결과), 한 기기 두 사람(기기 넘기기 화면),
// 봇끼리 관전(4배속 끝까지), 온라인(두 기기 동시 제출, 새로고침 복귀, 관전), 바로 시작 링크, 규칙.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

// 함대 말이 미끄러지는 중간이 찍히지 않게 움직임을 줄인다(style.css 의 prefers-reduced-motion)
const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const status = (page) => page.getByRole('status')
const waitStatus = (page, text, timeout = 20_000) => status(page).getByText(text, { exact: true }).waitFor({ timeout })

/** 지금 단계의 확정 버튼(기본 선택 그대로)을 누른다. 누를 것이 없으면 false */
async function confirmAny(page) {
  for (const name of [/^이동 확정$|^모두 머무름 확정$/, /^공격하지 않음$|^공격 \d건 확정$/, /^봉쇄/, /^점령 확정$/]) {
    const b = page.getByRole('button', { name })
    if (await b.count()) {
      await b.first().click()
      return true
    }
  }
  return false
}

/** 게임이 끝날 때까지 기본 선택으로 둔다 */
async function playToEnd(page, limit = 240_000) {
  const until = Date.now() + limit
  while (!(await status(page).getByText('게임 끝', { exact: true }).count())) {
    if (Date.now() > until) throw new Error('게임이 끝나지 않았습니다')
    if (!(await confirmAny(page))) await page.waitForTimeout(150)
    else await page.waitForTimeout(50)
  }
}

await withGame(dir, async ({ url, open, shot }) => {
  // ---------------------------------------------------------------- 나 vs 봇
  const solo = await open(PHONE)
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await waitStatus(solo, '계획 — 이동')
  await solo.getByRole('button', { name: '성계 2로 이동' }).click()
  await solo.getByRole('button', { name: '성계 1로 이동' }).click()
  await shot(solo, '02-plan')
  await solo.getByRole('button', { name: '이동 확정' }).click()
  await waitStatus(solo, '공격')
  await solo.getByRole('button', { name: '함대 1', exact: true }).click()
  await shot(solo, '03-attack')
  await solo.getByRole('button', { name: '함대 1', exact: true }).click()
  await solo.getByRole('button', { name: '공격하지 않음' }).click()
  await waitStatus(solo, '점령')
  await shot(solo, '04-occupy')
  await solo.getByRole('button', { name: '점령 확정' }).click()
  await waitStatus(solo, '계획 — 이동')
  await solo.getByRole('button', { name: '메뉴' }).click()
  await solo.getByRole('switch', { name: /봇 실체 보기/ }).click()
  await shot(solo, '05-menu')
  await solo.getByRole('button', { name: '닫기' }).click()
  await solo.getByText('봇 실체 보기', { exact: true }).waitFor()
  assert.ok((await solo.locator('.tok.oreal').count()) === 3, '봇 실체 3개가 보인다')
  await shot(solo, '06-peek')
  await playToEnd(solo)
  await solo.getByRole('dialog', { name: '결과' }).waitFor()
  await shot(solo, '07-result')
  await solo.getByRole('button', { name: '보드 보기' }).click()
  await shot(solo, '08-over-board')

  // ---------------------------------------------------------------- 한 기기 두 사람: 차례마다 기기 넘기기
  const pair = await open(PHONE)
  await pair.getByRole('button', { name: '봇', exact: true }).click()
  await pair.getByLabel('2번 자리 이름').fill('나래')
  await pair.getByRole('button', { name: '시작', exact: true }).click()
  await pair.getByText('1번 차례').waitFor()
  await shot(pair, '09-handoff')
  await pair.getByRole('button', { name: '1번 화면 보기' }).click()
  await pair.getByRole('button', { name: /확정$/ }).click()
  await pair.getByText('나래 차례').waitFor()
  assert.equal(await pair.locator('.lc-board').count(), 0, '넘기는 동안 지도를 가린다')
  await pair.getByRole('button', { name: '나래 화면 보기' }).click()
  await waitStatus(pair, '계획 — 이동')
  await shot(pair, '10-hotseat-second')

  // ---------------------------------------------------------------- 봇끼리 관전: 4배속으로 끝까지
  const watch = await open(PHONE)
  await watch.getByRole('button', { name: '사람', exact: true }).first().click()
  await watch.getByRole('button', { name: '시작', exact: true }).click()
  await watch.getByRole('button', { name: '4×' }).click()
  await shot(watch, '11-watch')
  await watch.getByRole('dialog', { name: '결과' }).waitFor({ timeout: 180_000 })
  await shot(watch, '12-watch-result')

  // ---------------------------------------------------------------- 온라인: 두 기기, 동시 제출, 새로고침해도 자리로 돌아온다
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
  await shot(host, '13-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await waitStatus(host, '계획 — 이동')
  await waitStatus(guest, '계획 — 이동')
  await host.getByRole('button', { name: '성계 2로 이동' }).click()
  await host.getByRole('button', { name: '이동 확정' }).click()
  await waitStatus(host, '제출 완료')
  await guest.getByText('제출함').waitFor()
  await shot(host, '14-online-submitted')
  await guest.reload()
  await waitStatus(guest, '계획 — 이동')
  await guest.getByRole('button', { name: /확정$/ }).click()
  await waitStatus(host, '공격')
  await waitStatus(guest, '공격')
  await shot(guest, '15-online-resumed')

  // 관전: 공개 정보만
  const viewer = await open(PHONE)
  await viewer.goto(`${url}?room=${code}`)
  await viewer.getByRole('button', { name: '관전' }).click()
  await status(viewer).getByText('공격').waitFor()
  assert.equal(await viewer.locator('.tok.real, .tok.oreal').count(), 0, '관전자에게 실체를 보이지 않는다')
  await shot(viewer, '16-online-watch')

  // ---------------------------------------------------------------- 바로 시작 링크, 규칙
  const quick = await open(PHONE)
  await quick.goto(`${url}?play=bot`)
  await waitStatus(quick, '계획 — 이동')
  await quick.goto(url)
  await quick.getByRole('button', { name: '규칙 한눈에' }).click()
  await shot(quick, '17-rules')
})
console.log('모바일 확인 통과')
