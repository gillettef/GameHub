/**
 * 덤 탐색: 덤은 봇의 수 선택을 바꾸지 않으므로(모든 수에 같은 상수) 덤 0 으로 한 번 돌린 판의 최종 점수로
 * 모든 덤 후보의 좌석 승률을 바로 계산한다.
 */
export interface FinalRow {
  scores: number[]; // 덤 제외
  land: number[];
  cubes?: number[];
}

export function winnerWith(row: FinalRow, komi: number[]): number {
  const P = row.scores.length;
  let best = 0;
  const sc = row.scores.map((v, i) => v + (komi[i] ?? 0));
  const key = (s: number) => [sc[s] as number, row.land[s] as number, -((row.cubes?.[s] ?? 0) as number), s];
  for (let s = 1; s < P; s++) {
    const a = key(s);
    const b = key(best);
    for (let i = 0; i < 4; i++) {
      if ((a[i] as number) > (b[i] as number)) {
        best = s;
        break;
      }
      if ((a[i] as number) < (b[i] as number)) break;
    }
  }
  return best;
}

export function seatRates(rows: FinalRow[], komi: number[]): number[] {
  const P = rows[0]?.scores.length ?? 2;
  const w = new Array(P).fill(0);
  for (const r of rows) w[winnerWith(r, komi)]++;
  return w.map((x) => x / Math.max(1, rows.length));
}

/** 덤 0~max (반 점 없이 정수) 조합 중 최대 편차가 가장 작은 것. 같으면 덤 합이 작은 것 */
export function bestKomi(rows: FinalRow[], max = 3): { komi: number[]; rates: number[]; dev: number } {
  const P = rows[0]?.scores.length ?? 2;
  let best = { komi: new Array(P).fill(0), rates: seatRates(rows, new Array(P).fill(0)), dev: Infinity };
  const rec = (acc: number[]): void => {
    if (acc.length === P) {
      if (Math.min(...acc) !== 0) return; // 가장 작은 덤은 0
      const rates = seatRates(rows, acc);
      const dev = Math.max(...rates.map((x) => Math.abs(x - 1 / P)));
      const sum = acc.reduce((a, b) => a + b, 0);
      const bsum = best.komi.reduce((a, b) => a + b, 0);
      if (dev < best.dev - 0.004 || (Math.abs(dev - best.dev) <= 0.004 && sum < bsum)) best = { komi: [...acc], rates, dev };
      return;
    }
    for (let k = 0; k <= max; k++) rec([...acc, k]);
  };
  rec([]);
  return best;
}
