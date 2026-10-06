import { useCallback, useEffect, useState } from 'react';
import { dispatch, newGame, type Action } from './game/engine';
import type { GameState } from './game/types';
import { loadGame, saveGame } from './platform/storage';
import { AssetSheet } from './ui/AssetSheet';
import { GameScreen } from './ui/Game';
import { Title } from './ui/Title';
import { TipHost } from './ui/tip';

/** `#assets` 이미지 슬롯 점검 페이지는 개발 모드에서만 연다 */
function useDevHash() {
  const [hash, setHash] = useState(() => (import.meta.env.DEV ? location.hash : ''));
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const h = () => setHash(location.hash);
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return hash;
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const hash = useDevHash();

  useEffect(() => {
    if (game) saveGame(game);
  }, [game]);

  const act = useCallback((a: Action) => setGame((g) => (g ? dispatch(g, a) : g)), []);

  if (import.meta.env.DEV && hash === '#assets') return <AssetSheet />;

  return (
    <div className="app">
      {game ? (
        <GameScreen game={game} act={act} onExit={() => setGame(null)} />
      ) : (
        <Title
          onNew={(aiCount) => setGame(newGame({ aiCount }))}
          onContinue={() => {
            const g = loadGame();
            if (g) setGame(g);
            return !!g;
          }}
        />
      )}
      <TipHost />
    </div>
  );
}
