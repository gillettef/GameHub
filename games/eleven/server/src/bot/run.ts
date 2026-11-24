import { parseArgs } from 'node:util';
import { Bot } from './bot';

// 사용법 (플래그 또는 위치 인자 — PowerShell 의 npm 래퍼는 --플래그를 벗겨내므로 위치 인자가 안전하다):
//   npm run bots -w server -- 방코드 3                        기존 방에 봇 3명 투입 (사람이 시작)
//   npm run bots -w server -- --code 방코드 --count 3         같은 뜻 (cmd / npm.cmd / bash)
//   npm run bots -w server -- create 4 start                  봇만의 방을 만들고 바로 시작
//   npm run bots -w server -- --create --count 4 --start      같은 뜻
// 옵션: --url ws://localhost:3001/ws  --delay 400(ms)  --seed 7

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    code: { type: 'string' },
    create: { type: 'boolean', default: false },
    start: { type: 'boolean', default: false },
    count: { type: 'string' },
    url: { type: 'string', default: process.env.ELEVEN_WS_URL ?? 'ws://localhost:3001/ws' },
    delay: { type: 'string', default: '400' },
    seed: { type: 'string' },
  },
});

// 위치 인자 해석: [코드|create] [인원] [start]
const [p0, p1, p2] = positionals;
const create = values.create || p0?.toLowerCase() === 'create';
const code = values.code ?? (create ? undefined : p0);
const start = values.start || p2?.toLowerCase() === 'start' || p1?.toLowerCase() === 'start';
const countArg = values.count ?? (p1 && /^\d+$/.test(p1) ? p1 : undefined);

const NAMES = ['봇-알파', '봇-브라보', '봇-찰리', '봇-델타'];
const count = Math.max(1, Math.min(4, Number(countArg ?? (create ? 4 : 3))));
const delayMs = Number(values.delay);
const seed = values.seed !== undefined ? Number(values.seed) : undefined;
const log = (line: string) => console.log(new Date().toISOString().slice(11, 19), line);

async function main() {
  if (!create && !code) {
    console.error('사용법: npm run bots -w server -- 방코드 [인원]   또는   npm run bots -w server -- create [인원] [start]');
    process.exit(1);
  }
  const bots: Bot[] = [];
  let roomCode = code;
  for (let i = 0; i < count; i++) {
    const bot = new Bot({ url: values.url, name: NAMES[i]!, seed: seed !== undefined ? seed + i : undefined, delayMs, log });
    await bot.connect(roomCode, seed);
    if (!roomCode) {
      roomCode = bot.code;
      log(`방 생성: ${roomCode} (브라우저에서 이 코드로 입장하거나 관전하세요)`);
    }
    bots.push(bot);
  }
  log(`봇 ${bots.length}명 입장 완료 (방 ${roomCode})`);
  if (create && start) {
    bots[0]!.startGame();
    log('게임 시작');
  } else if (create) {
    log('브라우저에서 이 코드로 입장한 뒤 시작하려면 호스트가 봇이라 시작할 수 없습니다. 바로 시작하려면 `create 4 start` 로 실행하세요.');
  }
  await Promise.all(bots.map((b) => b.waitForGameOver()));
  log('모든 봇 종료');
  for (const b of bots) b.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
