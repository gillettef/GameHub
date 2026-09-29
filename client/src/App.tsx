import { useState } from "react";
import { useGameSocket } from "./useGameSocket";
import { GameBoard } from "./GameBoard";

function App() {
  const { state, game, lastError, createRoom, joinRoom, startGame, submitClassChoice, selectActivity } =
    useGameSocket();
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  if (state.status === "in_room" && game && state.playerId) {
    return (
      <GameBoard
        game={game}
        myId={state.playerId}
        onSubmitClassChoice={submitClassChoice}
        onSelectActivity={selectActivity}
      />
    );
  }

  if (state.status === "in_room" && state.roomCode) {
    const canStart = state.players.length >= 2 && state.players.length <= 5;
    return (
      <main className="min-h-screen bg-purple-50 flex flex-col items-center px-4 py-8">
        <h1 className="text-2xl font-bold text-purple-700 mb-1">마법학교</h1>
        <p className="text-sm text-purple-400 mb-6">방 코드를 친구에게 공유해보세요</p>

        <div className="bg-white rounded-2xl shadow-sm px-8 py-5 mb-6">
          <p className="text-4xl font-mono font-bold tracking-widest text-purple-600 text-center">
            {state.roomCode}
          </p>
        </div>

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-purple-500 mb-2">참가한 플레이어 ({state.players.length}/5)</h2>
          <ul className="space-y-1">
            {state.players.length === 0 && <li className="text-purple-300 text-sm">아직 아무도 없어요</li>}
            {state.players.map((p) => (
              <li key={p.id} className="text-purple-700">
                {p.name}
              </li>
            ))}
          </ul>
        </div>

        {state.isHost && (
          <button
            className="w-full max-w-sm rounded-xl bg-purple-500 text-white font-semibold py-3 disabled:opacity-40"
            disabled={!canStart}
            onClick={startGame}
          >
            {canStart ? "게임 시작" : "2~5인이 모여야 시작할 수 있어요"}
          </button>
        )}
        {!state.isHost && <p className="text-purple-400 text-sm">방장이 게임을 시작하면 자동으로 시작됩니다</p>}

        {lastError && <p className="text-red-500 text-sm mt-3">{lastError}</p>}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-purple-50 flex flex-col items-center justify-center px-4 py-8 gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-purple-700">마법학교</h1>
        <p className="text-sm text-purple-400 mt-1">친구들과 함께 즐기는 마법 학교 보드게임</p>
      </div>

      <input
        className="w-full max-w-sm rounded-xl border border-purple-200 px-4 py-3 text-purple-800 placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-300"
        placeholder="닉네임을 입력하세요"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
      />

      <button
        className="w-full max-w-sm rounded-xl bg-purple-500 text-white font-semibold py-3 disabled:opacity-40"
        disabled={!playerName.trim()}
        onClick={() => createRoom(playerName.trim())}
      >
        새 방 만들기
      </button>

      <div className="w-full max-w-sm flex items-center gap-2">
        <div className="flex-1 h-px bg-purple-200" />
        <span className="text-purple-300 text-sm">또는</span>
        <div className="flex-1 h-px bg-purple-200" />
      </div>

      <div className="w-full max-w-sm flex gap-2">
        <input
          className="flex-1 rounded-xl border border-purple-200 px-4 py-3 text-purple-800 placeholder-purple-300 uppercase focus:outline-none focus:ring-2 focus:ring-purple-300"
          placeholder="방 코드"
          maxLength={4}
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
        />
        <button
          className="rounded-xl bg-purple-200 text-purple-700 font-semibold px-5 disabled:opacity-40"
          disabled={!playerName.trim() || joinCode.trim().length !== 4}
          onClick={() => joinRoom(joinCode.trim(), playerName.trim())}
        >
          입장
        </button>
      </div>

      {(state.status === "error" || lastError) && (
        <p className="text-red-500 text-sm">{state.errorMessage ?? lastError}</p>
      )}
    </main>
  );
}

export default App;
