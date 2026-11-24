/** 규칙상 할 수 없는 행동 */
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllegalActionError'
  }
}

export function fail(message: string): never {
  throw new IllegalActionError(message)
}
