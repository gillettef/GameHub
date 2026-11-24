import { describe, expect, it } from 'vitest';
import { clientIp } from './clientIp.js';

describe('clientIp', () => {
  it('허브(루프백)를 거친 요청은 X-Forwarded-For 맨 끝 주소', () => {
    expect(clientIp('127.0.0.1', '203.0.113.7')).toBe('203.0.113.7');
    expect(clientIp('::ffff:127.0.0.1', '1.1.1.1, 203.0.113.7')).toBe('203.0.113.7');
    expect(clientIp('::1', ['1.1.1.1', '203.0.113.7'])).toBe('203.0.113.7');
  });
  it('직접 접속은 헤더를 믿지 않는다', () => {
    expect(clientIp('198.51.100.2', '203.0.113.7')).toBe('198.51.100.2');
  });
  it('헤더가 없거나 비면 소켓 주소', () => {
    expect(clientIp('127.0.0.1', undefined)).toBe('127.0.0.1');
    expect(clientIp('127.0.0.1', ' ')).toBe('127.0.0.1');
    expect(clientIp(undefined, undefined)).toBe('unknown');
  });
});
