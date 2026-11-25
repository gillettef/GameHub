// 기반 전체 확인: 빌드 결과를 허브(/example/)에서 열어 한 기기 대전과 온라인 대전(두 기기, 새로고침 복귀)을 끝까지 둔다.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE_17_PRO_BROWSER, withGame } from '@gamehub/config/mobile'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 내 차례마다 가능한 첫 버튼을 눌러 끝까지 둔다 */
async function playOut(pages) {
  for (let k = 0; k < 60; k++) {
    for (const page of pages) {
      const button = page.locator('footer button:enabled').first()
      if ((await button.count()) === 0) continue
      if ((await button.innerText()) === '처음으로') return
      await button.click()
    }
    await pages[0].waitForTimeout(150)
  }
  throw new Error('게임이 끝나지 않았습니다')
}

await withGame(dir, async ({ url, open, shot }) => {
  const solo = await open()
  await shot(solo, '01-home')
  await solo.getByRole('button', { name: '시작', exact: true }).click()
  await solo.getByText('내 차례').waitFor()
  await shot(solo, '02-local')
  await solo.getByRole('button', { name: '메뉴' }).click()
  await shot(solo, '03-menu')
  await solo.getByRole('button', { name: '닫기' }).click()
  await playOut([solo])
  await shot(solo, '04-result')

  const host = await open(IPHONE_17_PRO_BROWSER)
  await host.getByRole('button', { name: '온라인' }).click()
  await host.getByLabel('닉네임').fill('가람')
  await host.getByRole('button', { name: '3명' }).click()
  await host.getByRole('button', { name: '방 만들기' }).click()
  const code = (await host.getByTestId('room-code').innerText()).trim()
  assert.match(code, /^[A-Z2-9]{4}$/)

  const guest = await open()
  await guest.goto(`${url}?room=${code}`)
  await guest.getByLabel('닉네임').fill('나래')
  await guest.getByRole('button', { name: '참가' }).click()
  await host.getByText('나래').waitFor()
  await shot(host, '05-waiting')
  await host.getByRole('button', { name: /^시작/ }).click()
  await host.getByText('내 차례').waitFor()
  await host.getByRole('button', { name: '2개' }).click()
  await guest.getByText('내 차례').waitFor()

  await guest.reload()
  await guest.getByText('내 차례').waitFor()
  await shot(guest, '06-resumed')
  await playOut([host, guest])
  await guest.getByRole('button', { name: '처음으로' }).waitFor()
  await shot(host, '07-online-result')
})
console.log('모바일 확인 통과')
