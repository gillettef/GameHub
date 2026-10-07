/**
 * 판 요약·웹 성능 기록 (2026-10-06). DB 없음 원칙대로 JSON Lines 파일에 한 줄씩 덧붙인다.
 *  - `<DATA_DIR>/stats/games.jsonl`  판이 끝나거나 방치되어 정리될 때 GameRecord 한 줄 (완수율·세션 시간·재방문)
 *  - `<DATA_DIR>/stats/vitals.jsonl` 클라이언트가 보낸 FCP·LCP·동기화 왕복 시간 한 줄
 * 집계는 `npm run stats -w server` (server/scripts/stats.ts). 쓰기 실패는 게임을 멈추지 않고 로그만 남긴다.
 */
import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { GameRecord } from '../rooms/manager.js';

/** 한 번에 받는 성능 기록. 모든 값은 ms, 클라이언트가 보낸 것이라 서버가 범위를 검사한 뒤 쓴다 */
export interface VitalsRecord {
  at: number;
  fcp: number | null;
  lcp: number | null;
  /** 액션 전송 → 서버 ack 왕복 시간 표본들 (F004) */
  syncRtt: number[];
  /** 연출 중 측정한 평균 프레임률 */
  fps: number | null;
  viewport: string | null;
}

/** 파일 하나의 크기 상한. 넘으면 더 쓰지 않는다(디스크를 다른 게임과 같이 쓰는 EC2 보호). 판 요약은 한 줄 ~1KB 라 수만 판까지 들어간다 */
const MAX_FILE_BYTES: Record<string, number> = { 'games.jsonl': 50 * 1024 * 1024, 'vitals.jsonl': 20 * 1024 * 1024 };

export class StatsLog {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'stats');
    mkdirSync(this.dir, { recursive: true });
  }

  private append(file: string, row: unknown): void {
    try {
      const path = join(this.dir, file);
      let size = 0;
      try {
        size = statSync(path).size;
      } catch {
        /* 아직 없음 */
      }
      if (size >= (MAX_FILE_BYTES[file] ?? 10 * 1024 * 1024)) return;
      appendFileSync(join(this.dir, file), `${JSON.stringify(row)}\n`, 'utf8');
    } catch (err) {
      console.error(`[stats] 기록 실패 ${file}: ${(err as Error).message}`);
    }
  }

  game(record: GameRecord): void {
    this.append('games.jsonl', record);
  }

  vitals(record: VitalsRecord): void {
    this.append('vitals.jsonl', record);
  }
}

const num = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);

/** 클라이언트 본문을 검사해 VitalsRecord 로 바꾼다. 쓸 값이 하나도 없으면 null */
export function parseVitals(body: unknown, now: number): VitalsRecord | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const rtt = Array.isArray(b.syncRtt) ? b.syncRtt.slice(0, 50).map((v) => num(v, 60_000)).filter((v): v is number => v !== null) : [];
  const record: VitalsRecord = {
    at: now,
    fcp: num(b.fcp, 120_000),
    lcp: num(b.lcp, 120_000),
    syncRtt: rtt,
    fps: num(b.fps, 240),
    viewport: typeof b.viewport === 'string' && /^\d{2,5}x\d{2,5}$/.test(b.viewport) ? b.viewport : null,
  };
  if (record.fcp === null && record.lcp === null && rtt.length === 0 && record.fps === null) return null;
  return record;
}
