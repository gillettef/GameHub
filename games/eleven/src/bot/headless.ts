// 지연 없이 한 판을 끝까지 두는 헤드리스 진행(테스트·밸런스 측정용). 모든 좌석을 def.bot 으로 둔다(옛 BotDriver.runUntilIdle).
// hold(봇 쉼·경기 보기 대기)는 시간이 흐른 것으로 보고 바로 지운다.
import type { SeatInfo } from '@gamehub/net';
import { def, type Action, type Options, type Table } from '../def';

export interface Played {
  table: Table;
  moves: { seat: number; action: Action }[];
}

export function playHeadless(seats: SeatInfo[], seed: number, options: Options = { division: 3 }, maxSteps = 20000): Played {
  let table = def.setup({ seats, seed, options });
  const memory = seats.map(() => ({}));
  const moves: Played['moves'] = [];
  const ctx = { name: (i: number) => seats[i]?.name ?? `${i + 1}번`, log: () => {}, byBot: true };
  for (let step = 0; step < maxSteps && !def.isOver(table); step++) {
    if (table.hold) table = { ...table, hold: null };
    const actors = def.actors(table);
    if (actors.length === 0) throw new Error(`아무도 둘 수 없는데 끝나지 않음: ${table.game.phase.kind}`);
    let done = false;
    for (const seat of actors) {
      const action = def.bot!.next(table, seat, memory[seat]!) ?? def.bot!.fallback!(table, seat);
      if (!action) continue;
      table = def.apply(table, seat, action, ctx);
      moves.push({ seat, action });
      done = true;
      break;
    }
    if (!done) throw new Error(`봇이 멈춤: ${table.game.phase.kind} ${table.game.week}주`);
  }
  if (!def.isOver(table)) throw new Error('최대 수 안에 끝나지 않음');
  return { table, moves };
}
