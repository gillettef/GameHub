import { parseArgs } from 'node:util';
import { Bot } from './bot';

// 사용법:
//   npm run bots -w server -- --code ABCDE --count 3        기존 방에 봇 3명 투입 (사람이 시작)
//   npm run bots -w server -- --create --count 4 [--start]  봇만의 방을 만들고 (--start 면) 바로 시작
// 옵션: --url ws://localhost:3001/ws  --delay 400(ms)  --seed 7

const { values } = parseArgs({
  options: {
    code: { type: 'string' },
    create: { type: 'boolean', default: false },
    start: { type: 'boolean', default: false },
    count: { type: 'string', default: '3' },
    url: { type: 'string', default: process.env.ELEVEN_WS_URL ?? 'ws://localhost:3001/ws' },
    delay: { type: 'string', default: '400' },
    seed: { type: 'string' },
  },
});

const NAMES = ['봇-알파', '봇-브라보', '봇-찰리', '봇-델타'];
const count = Math.max(1, Math.min(4, Number(values.count)));
const delayMs = Number(values.delay);
const seed = values.seed !== undefined ? Number(values.seed) : undefined;
const log = (line: string) => console.log(new Date().toISOString().slice(11, 19), line);

async function main() {
  if (!values.create && !values.code) {
    console.error('--code <방코드> 또는 --create 가 필요합니다');
    process.exit(1);
  }
  const bots: Bot[] = [];
  let code = values.code;
  for (let i = 0; i < count; i++) {
    const bot = new Bot({ url: values.url, name: NAMES[i]!, seed: seed !== undefined ? seed + i : undefined, delayMs, log });
    await bot.connect(code, seed);
    if (!code) {
      code = bot.code;
      log(`방 생성: ${code} (브라우저에서 이 코드로 입장하거나 관전하세요)`);
    }
    bots.push(bot);
  }
  log(`봇 ${bots.length}명 입장 완료 (방 ${code})`);
  if (values.create && values.start) {
    bots[0]!.startGame();
    log('게임 시작');
  } else if (values.create) {
    log('브라우저에서 입장한 뒤, 호스트(봇-알파)가 시작하려면 --start 옵션으로 다시 실행하세요. 또는 사람이 방을 만들고 --code 로 봇을 투입하세요.');
  }
  await Promise.all(bots.map((b) => b.waitForGameOver()));
  log('모든 봇 종료');
  for (const b of bots) b.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
