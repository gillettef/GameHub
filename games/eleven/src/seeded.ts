// 상태에 저장할 수 있는 난수: engine/rng.ts 의 createRng(mulberry32)와 같은 수열을 내되, 내부 값을 holder.s 에 둔다.
// 공통 방 코드는 상태(Table)를 그대로 보관·복제하므로, 엔진이 쓰는 Rng 의 위치를 상태 안의 숫자로 들고 있어야 한다.
// 같은 시드면 createRng(seed) 와 같은 값을 낸다(test/def.test.ts 가 확인).
import type { Rng } from './engine/rng';

export interface RngHolder {
  s: number;
}

export function seedState(seed: number): number {
  return seed >>> 0;
}

export function rngOf(holder: RngHolder): Rng {
  const float = () => {
    holder.s = (holder.s + 0x6d2b79f5) >>> 0;
    let t = holder.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number) => Math.floor(float() * max);
  return {
    float,
    int,
    die: (sides) => int(sides) + 1,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}
