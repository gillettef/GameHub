import { createRng } from '../engine/rng';
import type { Rng } from '../engine/rng';
import { viewFor } from '../engine/view';
import type { GameView } from '../engine/view';
import { RoomError, RoomManager } from '../rooms';
import type { Room } from '../rooms';
import { decide } from './policy';

interface BotMemory {
  rng: Rng;
  turnKey: string;
  failed: Set<string>;
}

// 차례가 바뀔 때마다 거부 기록을 비우기 위한 키 (주차·단계·요일·현재 참가자)
export function turnKeyOf(view: GameView): string {
  const phase = view.phase;
  const current = 'current' in phase ? phase.current : '';
  const day = phase.kind === 'weekday' ? phase.day : '';
  return `${view.week}:${phase.kind}:${day}:${current}`;
}

// 방 안의 서버 측 봇을 움직인다. 사람 액션이 들어올 때마다 poke() 해 주면
// 봇들이 한 번에 한 액션씩(관전 가능하도록 delayMs 간격) 더 할 일이 없을 때까지 진행한다
export class BotDriver {
  private timers = new Map<string, NodeJS.Timeout>();
  private memory = new Map<string, BotMemory>();

  constructor(
    private rooms: RoomManager,
    private onChange: (room: Room) => void,
    private delayMs = 300,
  ) {}

  poke(room: Room): void {
    if (room.status !== 'playing' || !room.players.some((p) => p.isBot)) return;
    if (this.timers.has(room.code)) return;
    this.timers.set(
      room.code,
      setTimeout(() => {
        this.timers.delete(room.code);
        if (this.step(room.code)) this.poke(this.rooms.get(room.code));
      }, this.delayMs),
    );
  }

  // 지연 없이 봇이 할 수 있는 액션을 모두 처리 (테스트·헤드리스용). 처리한 액션 수를 돌려준다
  runUntilIdle(code: string, maxSteps = 10000): number {
    let steps = 0;
    while (steps < maxSteps && this.step(code)) steps++;
    return steps;
  }

  // 봇 하나의 액션 하나를 적용. 적용했으면 true
  private step(code: string): boolean {
    let room: Room;
    try {
      room = this.rooms.get(code);
    } catch {
      return false;
    }
    if (room.status !== 'playing' || !room.game) return false;

    for (const bot of room.players.filter((p) => p.isBot)) {
      const view = viewFor(room.game, bot.id);
      const mem = this.memoryFor(room, bot.id, view);
      const action = decide(view, mem.rng, mem.failed);
      if (!action) continue;
      try {
        const next = this.rooms.act(code, bot.id, action);
        this.onChange(next);
        return true;
      } catch (e) {
        if (!(e instanceof RoomError)) throw e;
        mem.failed.add(action.type === 'cardAction' && action.paid ? 'paidCardAction' : action.type);
      }
    }
    return false;
  }

  private memoryFor(room: Room, botId: string, view: GameView): BotMemory {
    const key = `${room.code}:${botId}`;
    let mem = this.memory.get(key);
    if (!mem) {
      mem = { rng: createRng(room.seed + room.players.findIndex((p) => p.id === botId) + 1), turnKey: '', failed: new Set() };
      this.memory.set(key, mem);
    }
    const turnKey = turnKeyOf(view);
    if (turnKey !== mem.turnKey) {
      mem.turnKey = turnKey;
      mem.failed.clear();
    }
    return mem;
  }
}
