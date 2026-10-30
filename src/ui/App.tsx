import { useEffect } from 'react';
import { useApp } from '../store/app';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { Table } from './pages/Table';
import { Toast } from './components/Toast';
import { resumeOnline } from '../online/client';

export function App() {
  const screen = useApp((s) => s.screen);
  useEffect(() => {
    // 온라인 재접속 토큰이 있으면 이어 붙는다
    resumeOnline();
  }, []);
  return (
    <div className="app">
      <div className="sky" />
      {screen === 'home' && <Home />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <Table />}
      <Toast />
    </div>
  );
}
