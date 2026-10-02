/** mulberry32 — 시드 기반 난수. 상태를 숫자 하나로 저장해 세이브/재현이 쉽다. */
export function nextRng(seed: number): [number, number] {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}
