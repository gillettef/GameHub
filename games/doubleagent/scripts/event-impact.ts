/**
 * 이벤트가 결정을 바꾸는지: 이벤트 대상 선수(FW·DF/GK·유망주·몸값 6+)에 대한 제안 쏠림을
 * '시장 내 대상 비율' 대비 '제안 중 대상 비율'(쏠림 배율)로 보고, 이벤트 라운드와 이적시장 개장(효과 없음) 라운드를 비교한다.
 *   npx tsx scripts/event-impact.ts [--games 2000] [--players 3] [--seed 42] [--ai normal|easy]
 */
import { PLAYERS, createGame, createRng, nextRound, resolveRound } from '../src/core';
import type { AiLevel, EventKey, GameState, PlayerCard } from '../src/core';

declare const process: { argv: string[] };
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const GAMES = Number(arg('games', '2000'));
const N = Number(arg('players', '3'));
const AI = arg('ai', 'normal') as AiLevel;
const rng = createRng(Number(arg('seed', '42')));

const TARGET: Partial<Record<EventKey, (p: PlayerCard) => boolean>> = {
  fw: (p) => p.pos === 'FW',
  defense: (p) => p.pos === 'DF' || p.pos === 'GK',
  young: (p) => p.trait === '유망주',
  big: (p) => p.cost >= 6,
};
const keys = Object.keys(TARGET) as EventKey[];
// [이벤트 라운드, 개장 라운드] 각각 시장 대상 비율 합 / 제안 대상 비율 합
const acc = Object.fromEntries(keys.map((k) => [k, { ev: { mk: 0, of: 0, n: 0 }, base: { mk: 0, of: 0, n: 0 } }]));
// 이벤트 라운드에서 대상/비대상 제안 1건당 실제로 받은 수수료
const gain = Object.fromEntries(keys.map((k) => [k, { t: { n: 0, fee: 0 }, o: { n: 0, fee: 0 } }]));

for (let g = 0; g < GAMES; g++) {
  let s: GameState = createGame(Array.from({ length: N }, (_, i) => ({ name: `AI${i}`, kind: 'ai' as const, level: AI })), rng.int(2 ** 31));
  while (s.phase !== 'done') {
    const market = s.market.map((id) => PLAYERS[id]!);
    const ev = s.events[s.round - 1]!;
    s = resolveRound(s, {});
    const entries = s.results.at(-1)!.entries.filter((e) => e.offer && e.status !== 'invalid');
    const offers = entries.map((e) => PLAYERS[e.offer!.playerId]!);
    if (TARGET[ev])
      for (const e of entries) {
        const g = gain[ev]![TARGET[ev]!(PLAYERS[e.offer!.playerId]!) ? 't' : 'o'];
        g.n++;
        g.fee += e.status === 'won' ? e.fee! : 0;
      }
    if (offers.length) {
      for (const k of keys) {
        const slot = ev === k ? acc[k]!.ev : ev === 'normal' ? acc[k]!.base : null;
        if (!slot) continue;
        const f = TARGET[k]!;
        slot.mk += market.filter(f).length / market.length;
        slot.of += offers.filter(f).length / offers.length;
        slot.n++;
      }
    }
    s = nextRound(s);
  }
}
const r2 = (x: number) => Math.round(x * 100) / 100;
console.log(`# 이벤트 쏠림 N=${N} games=${GAMES} ai=${AI}`);
for (const k of keys) {
  const { ev, base } = acc[k]!;
  const ratio = (x: typeof ev) => (x.mk ? x.of / x.mk : 0);
  console.log(`${k}: 개장 라운드 쏠림 ${r2(ratio(base))}배 → 이벤트 라운드 ${r2(ratio(ev))}배 (대상 제안 비율 ${r2((base.of / base.n) * 100)}% → ${r2((ev.of / ev.n) * 100)}%), 이벤트 라운드 제안 1건당 수수료 대상 ${r2(gain[k]!.t.fee / gain[k]!.t.n)} / 비대상 ${r2(gain[k]!.o.fee / gain[k]!.o.n)}`);
}
