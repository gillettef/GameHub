// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/crease/)에서 열어 모든 모드를 둔다.
// 한 기기(걸음·접기 미리보기·확정·봇 차례), 봇 대전 관전(끝까지, 결과), 온라인(두 기기, 새로고침 복귀), 시뮬레이션, 규칙.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

// 접기·이동 애니메이션 중간이 찍히지 않게 움직임을 줄인다(style.css 의 prefers-reduced-motion)
const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 갈 수 있는 첫 칸으로 한 걸음 */
const step = (page) => page.getByRole('button', { name: /로 이동$/ }).first().click()

await withGame(dir, async ({ url, open, shot }) => {
  // 한 기기: 나 vs 봇
  const solo = await open(PHONE)
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await solo.getByText('내 차례').waitFor()
  await shot(solo, '02-local')
  await step(solo)
  const leftTwo = solo.getByRole('button', { name: '2열', exact: true }).first()
  await leftTwo.click()
  await solo.getByText('미리보기 · 같은 버튼을').waitFor()
  await shot(solo, '03-preview')
  await leftTwo.click()
  assert.equal(await leftTwo.isDisabled(), true, '접기는 차례에 한 번')
  await solo.getByRole('button', { name: '차례 끝내기' }).click()
  await solo.getByText('생각 중').waitFor()
  await solo.getByText('내 차례').waitFor({ timeout: 20_000 })
  await solo.getByRole('button', { name: '메뉴' }).click()
  await shot(solo, '04-menu')
  await solo.getByRole('button', { name: '닫기' }).click()

  // 봇 대전 관전: 4배속으로 끝까지
  const watch = await open(PHONE)
  await watch.getByRole('button', { name: '봇 대전 관전' }).click()
  await watch.getByRole('button', { name: '2인' }).click()
  await shot(watch, '05-watch-setup')
  await watch.getByRole('button', { name: '관전 시작' }).click()
  await watch.getByRole('button', { name: '4×' }).click()
  await shot(watch, '06-watch')
  await watch.getByRole('dialog', { name: '결과' }).waitFor({ timeout: 180_000 })
  await shot(watch, '07-result')

  // 온라인: 두 기기, 새로고침해도 자리로 돌아온다
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
  await shot(host, '08-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await host.getByText('내 차례').waitFor()
  await step(host)
  await host.getByRole('button', { name: '차례 끝내기' }).click()
  await guest.getByText('내 차례').waitFor()
  await guest.reload()
  await guest.getByText('내 차례').waitFor()
  await step(guest)
  await host.getByText('나래: →').first().waitFor()
  await shot(guest, '09-online-resumed')

  // 밸런스 시뮬레이션, 규칙
  const sim = await open(PHONE)
  await sim.getByRole('button', { name: '밸런스 시뮬레이션' }).click()
  await sim.getByRole('button', { name: '2인' }).click()
  await sim.getByRole('button', { name: '50', exact: true }).click()
  await sim.getByRole('button', { name: '실행', exact: true }).click()
  await sim.getByRole('button', { name: '다시 실행' }).waitFor({ timeout: 120_000 })
  await shot(sim, '10-sim')
  await sim.getByRole('button', { name: '‹ 처음으로' }).click()
  await sim.getByRole('button', { name: '규칙 한눈에' }).click()
  await shot(sim, '11-rules')
})
console.log('모바일 확인 통과')
