// 요청한 사람의 IP. 같은 서버의 GameHub 허브(127.0.0.1)를 거쳐 온 요청이면 허브가 X-Forwarded-For 맨 끝에 붙인
// 실제 접속 주소를 쓰고, 그 밖의 요청(직접 접속)은 헤더를 믿지 않고 소켓 주소를 쓴다(위조 방지).
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export function clientIp(req) {
  const peer = req.socket.remoteAddress || '';
  const xff = req.headers['x-forwarded-for'];
  if (LOOPBACK.has(peer) && typeof xff === 'string') {
    const last = xff.split(',').pop().trim();
    if (last) return last;
  }
  return peer || '?';
}
