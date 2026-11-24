// 온라인 대전 클라이언트: REST(POST) + SSE(상태 스트림). 서버 API는 scripts/aws/serve.mjs 참고.

async function call(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `서버 오류 (${r.status})`);
  return j;
}

export const createRoom = (cfg) => call('POST', '/api/rooms', cfg);
export const roomInfo = (code) => call('GET', `/api/rooms/${encodeURIComponent(code)}`);
export const joinRoom = (code) => call('POST', `/api/rooms/${encodeURIComponent(code)}/join`, {});
export const sendAction = (code, token, action) => call('POST', `/api/rooms/${encodeURIComponent(code)}/action`, { token, action });
export const requestRematch = (code, token) => call('POST', `/api/rooms/${encodeURIComponent(code)}/rematch`, { token });

/**
 * 상태 스트림에 연결한다. EventSource가 끊기면 스스로 다시 연결한다.
 * onSnap(snapshot), onStatus('open'|'reconnecting'), onFatal(message)
 */
export function connect(code, token, { onSnap, onStatus, onFatal }) {
  const es = new EventSource(`/api/rooms/${encodeURIComponent(code)}/events?token=${encodeURIComponent(token)}`);
  es.addEventListener('state', (e) => onSnap(JSON.parse(e.data)));
  es.addEventListener('fatal', (e) => { es.close(); onFatal(JSON.parse(e.data).error); });
  es.onopen = () => onStatus('open');
  es.onerror = () => onStatus('reconnecting');
  return () => es.close();
}

// 재접속용: 방 코드별 좌석 토큰을 기기에 저장한다
const KEY = 'lastgrain.rooms';
const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
export function saveSeat(code, token) {
  try {
    const all = readAll();
    all[code] = { token, at: Date.now() };
    for (const k of Object.keys(all)) if (Date.now() - all[k].at > 6 * 3600_000) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* 저장소를 못 쓰면 재접속만 안 된다 */ }
}
export const loadSeat = (code) => readAll()[code]?.token || null;
export function forgetSeat(code) {
  try { const all = readAll(); delete all[code]; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 무시 */ }
}
