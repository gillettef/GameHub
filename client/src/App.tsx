import { useEffect, useState } from 'react';

type Status = 'connecting' | 'open' | 'closed';

export function App() {
  const [status, setStatus] = useState<Status>('connecting');
  const [lastMessage, setLastMessage] = useState<string>('');

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    socket.onopen = () => setStatus('open');
    socket.onclose = () => setStatus('closed');
    socket.onmessage = (event) => setLastMessage(String(event.data));
    return () => socket.close();
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Eleven</h1>
      <p>서버 연결: {status}</p>
      <pre>{lastMessage}</pre>
    </main>
  );
}
