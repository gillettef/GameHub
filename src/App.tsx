import { useCallback, useEffect, useState } from 'react';
import { dispatch, newGame, type Action } from './game/engine';
import type { GameState } from './game/types';
import { loadGame, saveGame } from './platform/storage';
import { AssetSheet } from './ui/AssetSheet';
import { GameScreen } from './ui/Game';
import { Title } from './ui/Title';

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    const h = () => setHash(location.hash);
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  useEffect(() => {
    if (game) saveGame(game);
  }, [game]);

  const act = useCallback((a: Action) => setGame((g) => (g ? dispatch(g, a) : g)), []);

  if (hash === '#assets') return <AssetSheet />;

  return (
    <div className="app">
      {game ? (
        <GameScreen game={game} act={act} onExit={() => setGame(null)} />
      ) : (
        <Title onNew={(aiCount) => setGame(newGame({ aiCount }))} onContinue={() => setGame(loadGame())} />
      )}
    </div>
  );
}
