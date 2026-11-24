import { afterEach, describe, expect, it, vi } from 'vitest';
import { newClientId } from '../src/game/storage';

describe('newClientId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('randomUUID 가 없는 비보안 컨텍스트(HTTP)에서도 만든다', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    const id = newClientId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    // clientId() 가 저장된 값을 다시 쓰는 형식 검사와도 맞아야 한다
    expect(id).toMatch(/^[\w-]{8,64}$/);
    expect(newClientId()).not.toBe(id);
  });
});
