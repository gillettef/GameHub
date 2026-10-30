// 시드 RNG (sfc32, 상태 128비트). 상태 안의 rngState 만 쓴다 — Math.random 금지
// 32비트 시드 하나로는 온라인에서 공개 정보로 시드를 역산할 수 있어, 서버는 32비트 단어 4개로 시드한다

export type RngState = [number, number, number, number];

export interface Rng {
  next(): number;
  int(n: number): number;
  shuffle<T>(arr: T[]): T[];
  state(): RngState;
}

/** 새 게임용: 숫자 하나(로컬·테스트) 또는 단어 4개(서버)로 시드하고 몇 번 돌려 섞는다 */
export function createRng(seed: number | number[]): Rng {
  let init: RngState;
  if (Array.isArray(seed) && seed.length === 4) {
    init = seed.map((x) => x >>> 0) as RngState;
  } else {
    // splitmix32 로 숫자 하나를 단어 4개로 펼친다
    let s = (Array.isArray(seed) ? (seed[0] ?? 0) : seed) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      out.push((z ^ (z >>> 16)) >>> 0);
    }
    init = out as RngState;
  }
  const rng = restoreRng(init);
  for (let i = 0; i < 12; i++) rng.next();
  return rng;
}

/** 저장된 상태에서 이어 쓴다 */
export function restoreRng(state: RngState): Rng {
  let [a, b, c, d] = state.map((x) => x >>> 0);
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    shuffle<T>(arr: T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    state: () => [a, b, c, d],
  };
}
