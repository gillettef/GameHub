/**
 * JSON 파일 스냅샷 (F006, F007). DB 없음. 방 레코드(Room)를 통째로 `<DATA_DIR>/rooms/<roomId>.json` 에 쓴다.
 * 상태가 바뀔 때마다 저장하고(턴 종료 포함), 서버 시작 시 디렉터리를 읽어 메모리에 복원한다.
 * 쓰기는 임시 파일 → rename 으로 원자적으로 한다. 실패해도 게임은 멈추지 않고 로그만 남긴다.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Room } from '../rooms/manager.js';

export class SnapshotStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'rooms');
    mkdirSync(this.dir, { recursive: true });
  }

  private pathOf(roomId: string): string {
    return join(this.dir, `${roomId}.json`);
  }

  save(room: Room): void {
    const target = this.pathOf(room.roomId);
    const tmp = `${target}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(room), 'utf8');
      renameSync(tmp, target);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
      console.error(`[snapshot] 저장 실패 room=${room.roomId} code=${code}: ${(err as Error).message}`);
    }
  }

  /** 이어 갈 수 없는 스냅샷(예전 게임 형식)은 지우지 않고 rooms-legacy/ 로 옮겨 둔다 */
  quarantine(roomId: string): void {
    try {
      const dir = join(this.dir, '..', 'rooms-legacy');
      mkdirSync(dir, { recursive: true });
      const from = this.pathOf(roomId);
      if (existsSync(from)) renameSync(from, join(dir, `${roomId}.json`));
    } catch (err) {
      console.error(`[snapshot] 격리 실패 room=${roomId}: ${(err as Error).message}`);
    }
  }

  delete(roomId: string): void {
    try {
      rmSync(this.pathOf(roomId), { force: true });
    } catch (err) {
      console.error(`[snapshot] 삭제 실패 room=${roomId}: ${(err as Error).message}`);
    }
  }

  /** 디렉터리의 모든 스냅샷. 깨진 파일은 건너뛰고 로그를 남긴다 */
  loadAll(): Room[] {
    const rooms: Room[] = [];
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = readFileSync(join(this.dir, name), 'utf8');
        const room = JSON.parse(raw) as Room;
        if (!room?.roomId || !room.state?.players) throw new Error('필드 누락');
        rooms.push(room);
      } catch (err) {
        console.error(`[snapshot] 복구 실패 ${name}: ${(err as Error).message}`);
      }
    }
    return rooms;
  }
}
