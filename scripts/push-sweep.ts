/**
 * 비밀 구단을 얼마나 밀어 주는 게 좋은가: 실험용 페르소나(위장형 자리)의 push·stealth 를 바꿔 가며
 * 균형형 N−1명을 상대로 1석당 승률을 잰다.
 *   npx tsx scripts/push-sweep.ts --players 3 --games 600 --rules clubBonus=5,clubOwnOnly=1
 */
import { PERSONAS, RULES, createGame, createRng, finishGame, nextRound, resolveRound, winners } from '../src/core';
import type { GameState, PersonaKey } from '../src/core';

declare const process: { argv: string[] };
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const N = Number(arg('players', '3'));
const GAMES = Number(arg('games', '600'));
for (const kv of arg('rules', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  (RULES as unknown as Record<string, number | null>)[k!] = v === 'null' ? null : Number(v);
}
for (const kv of arg('persona', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  (PERSONAS.balanced as unknown as Record<string, number>)[k!] = Number(v);
}
const rng = createRng(Number(arg('seed', '42')));

function rate(): { win: number; club: number; exposed: number; fee: number } {
  let win = 0;
  let club = 0;
  let exposed = 0;
  let fee = 0;
  for (let g = 0; g < GAMES; g++) {
    const seats: PersonaKey[] = rng.shuffle(['stealth', ...Array<PersonaKey>(N - 1).fill('balanced')]);
    let s: GameState = createGame(
      seats.map((p, i) => ({ name: `${p}${i}`, kind: 'ai' as const, persona: p })),
      rng.int(2 ** 31),
    );
    while (s.phase !== 'guess') s = nextRound(resolveRound(s, {}));
    s = finishGame(s, {});
    const me = seats.indexOf('stealth');
    const ws = winners(s);
    if (ws.includes(me)) win += 1 / ws.length;
    club += s.agents[me]!.final!.clubPoints;
    exposed += s.agents[me]!.final!.exposed ? 1 : 0;
    fee += s.agents[me]!.score;
  }
  return { win: win / GAMES, club: club / GAMES, exposed: exposed / GAMES, fee: fee / GAMES };
}

console.log(`# push sweep N=${N} games=${GAMES} rules=${JSON.stringify(RULES)}`);
for (const stealth of arg('stealth', 'true,false').split(',').map((x) => x === 'true')) {
  for (const push of arg('push', '0,1,2,3,5,8').split(',').map(Number)) {
    Object.assign(PERSONAS.stealth, { push, stealth, deny: PERSONAS.balanced.deny, save: PERSONAS.balanced.save, greed: PERSONAS.balanced.greed });
    const r = rate();
    console.log(`stealth=${stealth} push=${push}: 승률 ${Math.round(r.win * 1000) / 10}% · 수수료 ${Math.round(r.fee * 10) / 10} · 비밀 구단 ${Math.round(r.club * 10) / 10} · 노출 ${Math.round(r.exposed * 100)}%`);
  }
}
