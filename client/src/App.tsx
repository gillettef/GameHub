import { useEffect, useState } from 'react';
import { MAPS } from '@astraltab/shared';

interface Health {
  ok: boolean;
  service: string;
  ai: 'ok' | 'down';
}

/**
 * 스캐폴딩 확인용 화면. 서버·AI 연결 상태와 공용 상수를 보여준다.
 * Phase 1에서 pages/ 와 tabs/ 로 교체한다.
 */
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setError('서버에 연결할 수 없습니다. /dev 로 서버를 먼저 실행하세요.'));
  }, []);

  return (
    <main className="scaffold">
      <h1>AstralTab</h1>
      <p className="scaffold__lead">스캐폴딩이 준비됐습니다.</p>
      <dl className="scaffold__status">
        <dt>서버</dt>
        <dd>{error ?? (health ? '연결됨' : '확인 중')}</dd>
        <dt>AI 서비스</dt>
        <dd>{health ? (health.ai === 'ok' ? '연결됨' : '꺼져 있음') : '확인 중'}</dd>
        <dt>맵</dt>
        <dd>
          {MAPS.map((m) => m.name).join(', ')}
        </dd>
      </dl>
    </main>
  );
}
