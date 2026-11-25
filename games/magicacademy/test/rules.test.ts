// 옛 서버의 규칙 검증(server/scripts/rules-check.ts, npm run check) 115개를 새 엔진으로 그대로 돌린다.
// 검증들이 규칙 스위치(BALANCE)를 차례로 바꿔 가며 보므로 순서대로 한 번에 실행한다(실패하면 그 검증의 assert 가 던진다).
import { expect, test, vi } from 'vitest'

test('옛 규칙 검증 115개가 모두 통과한다', async () => {
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')))
  try {
    await import('./rules-check')
  } finally {
    spy.mockRestore()
  }
  expect(lines.filter((l) => l.trimStart().startsWith('✓')).length).toBe(115)
}, 600_000)
