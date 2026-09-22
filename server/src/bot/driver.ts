import type { GameAction } from '../engine/actions';
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

// 액션 뒤에 쉬는 시간(delayMs 의 배수). 사람이 지켜보며 봇의 선택과 결과(효과 토스트·주사위 애니메이션)를
// 읽을 수 있도록, 굴린 뒤에는 주사위가 멈추고 결과가 보일 때까지, 행동 뒤에는 토스트가 떠 있는 동안 기다린다.
// 토스트는 1초(client feed.tsx TOAST_MS)이므로 토스트가 생기는 액션의 배수는 ≥1.5(기본 800ms 기준 1.2초)로 두어
// 알림이 닫힌 뒤에 다음 행동이 온다 (사용자 요청, 2026-09). 준비 단계 선택·이사회 주사위는 토스트가 없다
const PAUSE_FACTOR: Record<GameAction['type'], number> = {
  draftPick: 1,
  chooseObjective: 1,
  resolvePending: 2,
  rollBoardDie: 4,
  rerollBoardDie: 4,
  acceptBoardRoll: 3,
  recruitPlayer: 3,
  recruitProspect: 3,
  releasePlayer: 3,
  hireStaff: 3,
  signSponsor: 3,
  buildInfrastructure: 3,
  buildOffice: 3,
  cardAction: 3,
  pass: 2,
  endTurn: 1.5,
  submitLineup: 3,
  playTacticEffect: 3,
  redrawTactic: 2,
  rollMatchDie: 4,
  rerollMatchDie: 4,
  acceptMatchRoll: 3,
  rollInjuryDie: 4,
  rerollInjuryDie: 4,
  acceptInjuryRoll: 3,
  undoTurn: 1,
};

const MAX_ATTEMPTS = 12; // 한 step 에서 거부 뒤 다시 판단하는 최대 횟수 (액션 종류 수보다 크면 충분)

// 방 안의 서버 측 봇을 움직인다. 사람 액션이 들어올 때마다 poke() 해 주면
// 봇들이 한 번에 한 액션씩(관전 가능하도록 delayMs 를 기준으로 액션마다 다른 간격) 더 할 일이 없을 때까지 진행한다
export class BotDriver {
  private timers = new Map<string, NodeJS.Timeout>();
  private memory = new Map<string, BotMemory>();

  constructor(
    private rooms: RoomManager,
    private onChange: (room: Room) => void,
    private delayMs = 300,
    private watchMs = 24000, // 봇의 경기 보기(재생) 시간: 경기 영향 주사위를 굴리기 전에 사람들이 그 봇의 경기 재생을 볼 수 있게 기다린다
  ) {}

  poke(room: Room, delay = this.delayMs): void {
    if (room.status !== 'playing' || !room.players.some((p) => p.isBot)) return;
    if (this.timers.has(room.code)) return;
    const wait = Math.max(delay, this.watchDelay(room));
    this.timers.set(
      room.code,
      setTimeout(() => {
        this.timers.delete(room.code);
        const applied = this.step(room.code);
        if (applied) this.poke(this.rooms.get(room.code), this.delayMs * PAUSE_FACTOR[applied.type]);
      }, wait),
    );
  }

  // 경기 결과 단계에서 차례인 봇이 아직 주사위를 굴리지 않았으면(= 경기 보기 스텝) 재생 시간만큼 기다린다.
  // 봇이 곧바로 굴리면 지켜보는 사람의 화면이 경기 보기에서 주사위 스텝으로 바로 넘어가 버린다 (사용자 제보 2026-09-22)
  private watchDelay(room: Room): number {
    const phase = room.game?.phase;
    if (!phase || phase.kind !== 'friday.aftermath') return 0;
    const bot = room.players.find((p) => p.id === phase.current && p.isBot);
    const m = phase.matches[phase.current];
    return bot && m && m.roll === null && m.injuryDice.length === 0 ? this.watchMs : 0;
  }

  // 지연 없이 봇이 할 수 있는 액션을 모두 처리 (테스트·헤드리스용). 처리한 액션 수를 돌려준다
  runUntilIdle(code: string, maxSteps = 10000): number {
    let steps = 0;
    while (steps < maxSteps && this.step(code)) steps++;
    return steps;
  }

  // 봇 하나의 액션 하나를 적용. 적용한 액션을 돌려준다 (없으면 null)
  private step(code: string): GameAction | null {
    let room: Room;
    try {
      room = this.rooms.get(code);
    } catch {
      return null;
    }
    if (room.status !== 'playing' || !room.game) return null;

    for (const bot of room.players.filter((p) => p.isBot)) {
      const view = viewFor(room.game, bot.id);
      const mem = this.memoryFor(room, bot.id, view);
      // 서버가 거부하면 그 액션 종류를 기억하고 곧바로 다시 판단한다 — 거부 한 번에 멈추면 사람이 다시 건드릴 때까지 봇이 서 버린다
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const action = decide(view, mem.rng, mem.failed);
        if (!action) break;
        try {
          const next = this.rooms.act(code, bot.id, action);
          this.onChange(next);
          return action;
        } catch (e) {
          if (!(e instanceof RoomError)) throw e;
          mem.failed.add(action.type === 'cardAction' && action.paid ? 'paidCardAction' : action.type);
        }
      }
    }
    return null;
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
