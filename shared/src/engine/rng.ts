/**
 * 시드 기반 결정적 난수 (mulberry32). 엔진은 Math.random 을 쓰지 않는다.
 * 상태에 seed 를 보관하고, 사용할 때마다 새 seed 를 함께 돌려준다.
 */

export interface RngResult {
  value: number; // [0, 1)
  seed: number;
}

export function nextRandom(seed: number): RngResult {
  let t = (seed + 0x6d2b79f5) >>> 0;
  let x = Math.imul(t ^ (t >>> 15), 1 | t);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

/** Fisher-Yates. 입력 배열을 변이하지 않고 새 배열과 새 seed 를 돌려준다 */
export function shuffle<T>(items: readonly T[], seed: number): { items: T[]; seed: number } {
  const out = items.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.seed;
    const j = Math.floor(r.value * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return { items: out, seed: s };
}

// ---------------------------------------------------------------------------
// 카드 더미 셔플 전용 128비트 RNG (sfc32). 마켓이 더미 앞부분을 차례로 공개하므로 32비트 시드는
// 공개 정보로 전수 탐색해 역산할 수 있다(2026-10-08 리뷰). 더미 키는 32비트 4개다
// ---------------------------------------------------------------------------

export type DeckKey = [number, number, number, number];

/** 숫자 하나(핫시트·테스트)에서 더미 키 4개를 만든다. 온라인 서버는 암호학적 난수 4개를 바로 쓴다 */
export function deckKeyFrom(seed: number | readonly number[]): DeckKey {
  if (Array.isArray(seed) && seed.length === 4) return seed.map((x) => x >>> 0) as DeckKey;
  let s = (typeof seed === 'number' ? seed : 0) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = nextRandom(s);
    s = r.seed;
    out.push(Math.floor(r.value * 4294967296) >>> 0);
  }
  return out as DeckKey;
}

function sfc32(key: DeckKey): { value: number; key: DeckKey } {
  let [a, b, c, d] = key;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  return { value: t / 4294967296, key: [a >>> 0, b, c, d] };
}

/** Fisher-Yates (sfc32). 입력 배열을 변이하지 않는다. 시작 전에 12번 돌려 키를 섞는다 */
export function shuffleDeck<T>(items: readonly T[], key: DeckKey): { items: T[]; key: DeckKey } {
  let k = key;
  for (let i = 0; i < 12; i++) k = sfc32(k).key;
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const r = sfc32(k);
    k = r.key;
    const j = Math.floor(r.value * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return { items: out, key: k };
}
