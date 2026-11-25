// iPhone 17 Pro 화면 확인: 빌드 결과를 허브(/lastgrain/)에서 열어 봇 대전(소환·이동·기권·결과)과
// 온라인(두 기기, 카운트다운, 서버 시계, 새로고침 복귀)을 둔다.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO, IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PHONE = { ...IPHONE_17_PRO, reducedMotion: 'reduce' }
const BROWSER = { ...IPHONE_17_PRO_BROWSER, reducedMotion: 'reduce' }

/** 비축의 정찰병을 내 소환 줄 칸에 소환한다 */
async function summonScout(page, cell) {
  await page.getByRole('button', { name: '정찰병 소환' }).first().click()
  await page.getByRole('button', { name: new RegExp(`^${cell}`) }).click()
}

await withGame(dir, async ({ url, open, shot }) => {
  // 봇 대전
  const solo = await open(PHONE)
  await shot(solo, '01-home')
  await solo.getByLabel('봇 생각 시간').selectOption({ label: '빠름 · 0.8초' })
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await solo.getByText('보드가 비었다').waitFor()
  await shot(solo, '02-local')
  await summonScout(solo, 'C1')
  await shot(solo, '03-summon')
  await solo.getByRole('button', { name: '차례 마치기' }).click()
  await solo.getByText('내 차례 — 내 모래가 흐른다').waitFor({ timeout: 30_000 })
  // 지난 차례에 소환한 정찰병을 골라 앞으로
  await solo.getByRole('button', { name: /^C1, 나 정찰병/ }).click()
  await solo.getByRole('button', { name: /이동할 수 있음$/ }).first().waitFor()
  await shot(solo, '04-select')
  await solo.getByRole('button', { name: /^C2.*이동할 수 있음$/ }).click()
  await solo.getByRole('button', { name: '메뉴' }).click()
  await shot(solo, '05-menu')
  await solo.getByRole('button', { name: /기권/ }).click()
  await solo.getByRole('button', { name: /정말 기권한다/ }).click()
  await solo.getByRole('dialog', { name: '결과' }).waitFor()
  await shot(solo, '06-result')

  // 온라인: 두 기기
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
  await shot(host, '07-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await guest.getByText('곧 시작한다').waitFor()
  await shot(guest, '08-countdown')
  await host.getByText('보드가 비었다').waitFor({ timeout: 10_000 })
  await summonScout(host, 'A1')
  await host.getByRole('button', { name: '차례 마치기' }).click()
  await guest.getByText('보드가 비었다').waitFor()
  await guest.reload()
  await guest.getByText('보드가 비었다').waitFor()
  await summonScout(guest, 'E5')
  await host.getByText(/\[나래\].*소환/).count()
  await shot(guest, '09-online-resumed')
})
console.log('모바일 확인 통과')
