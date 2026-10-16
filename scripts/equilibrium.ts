/**
 * 기본 AI(균형형)를 '공략당하지 않는' 지점으로 맞춘다: 후보 성향 B 마다
 * 변형 1명 + B 복제 N−1명으로 대진시켜 변형의 1석당 승률을 잰다.
 * 어떤 변형도 공정값을 크게 넘지 못하는 B 가 대칭 균형에 가깝다.
 *   npx tsx scripts/equilibrium.ts --players 3 --games 300 --rules ...
 */
import { PERSONAS, RULES, createGame, createRng, finishGame, nextRound, resolveRound, winners } from '../src/core';
import type { GameState, Persona, PersonaKey } from '../src/core';

declare const process: { argv: string[] };
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const N = Number(arg('players', '3'));
const GAMES = Number(arg('games', '300'));
for (const kv of arg('rules', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  (RULES as unknown as Record<string, unknown>)[k!] = v === 'null' ? null : v!.includes('/') ? v!.split('/').map(Number) : Number(v);
}
const rng = createRng(Number(arg('seed', '42')));
const fair = 1 / N;

/** 변형은 stealth 자리, 기준 성향은 balanced 자리에 넣어 대진 */
function rate(variant: Persona, baseP: Persona): number {
  Object.assign(PERSONAS.balanced, baseP);
  Object.assign(PERSONAS.stealth, variant);
  let win = 0;
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
  }
  return win / GAMES;
}

const original = { ...PERSONAS.balanced };
const grid: Partial<Persona>[] = [];
for (const greed of (arg('greed', '-0.5,0,0.5,1').split(',').map(Number)))
  for (const risk of (arg('risk', '1,1.5,2').split(',').map(Number))) grid.push({ greed, risk });

console.log(`# 균형점 탐색 N=${N} games=${GAMES} 공정값 ${Math.round(fair * 1000) / 10}%`);
for (const g of grid) {
  const B: Persona = { ...original, ...g };
  const variants: [string, Persona][] = [
    ['최저 카드', { ...B, demand: 'min' }],
    ['최고 카드', { ...B, demand: 'max' }],
    ['더 욕심', { ...B, greed: B.greed + 1 }],
    ['더 신중', { ...B, risk: B.risk + 1, greed: B.greed - 0.5 }],
  ];
  const rs = variants.map(([n, v]) => [n, rate({ ...v, demand: v.demand } as Persona, B)] as const);
  const worst = Math.max(...rs.map(([, r]) => r));
  console.log(`greed=${g.greed} risk=${g.risk}: 최대 공략 ${Math.round(worst * 1000) / 10}% (${rs.map(([n, r]) => `${n} ${Math.round(r * 1000) / 10}%`).join(' · ')})`);
  // demand 속성이 남지 않게 초기화
  delete (PERSONAS.stealth as Partial<Persona>).demand;
}
