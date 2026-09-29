import { useState } from "react";

// HTTP 환경에서는 navigator.clipboard를 쓸 수 없어서 execCommand로 대체한다
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 폴백으로 진행
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(el);
  }
}
import { useGameSocket } from "./useGameSocket";
import { GameBoard } from "./GameBoard";

function App() {
  const { state, game, lastError, createRoom, joinRoom, startGame, submitClassChoice, selectActivity } =
    useGameSocket();
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  const shareRoom = async (code: string) => {
    const text = `마법학교 방 코드: ${code}
${window.location.href}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "마법학교", text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
      <main className="min-h-dvh flex flex-col items-center px-4 py-8">
        <h1 className="text-3xl font-display text-purple-700 mb-1">마법학교</h1>
        <p className="text-sm text-purple-500 mb-6">방 코드를 친구에게 공유해보세요</p>

        <div className="bg-white rounded-2xl shadow-sm px-8 py-5 mb-6">
          <p className="pop-in text-5xl font-display font-bold tracking-widest text-purple-600 text-center">
            {state.roomCode}
          </p>
        </div>

        <button
          className="w-full max-w-sm min-h-12 rounded-2xl bg-pink-200 text-pink-800 py-3 mb-4 active:scale-95 transition-transform"
          onClick={() => shareRoom(state.roomCode!)}
        >
          {copied ? "✅ 복사했어요!" : "📤 방 코드 공유·복사"}
        </button>

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-purple-500 mb-2">참가한 플레이어 ({state.players.length}/5)</h2>
          <ul className="space-y-1">
            {state.players.length === 0 && <li className="text-purple-500 text-sm">아직 아무도 없어요</li>}
            {state.players.map((p) => (
              <li key={p.id} className="text-purple-700">
                {p.name}
              </li>
            ))}
          </ul>
        </div>

        {state.isHost && (
          <button
            className="w-full max-w-sm rounded-2xl bg-purple-500 text-white font-semibold min-h-12 py-3 disabled:opacity-40"
            disabled={!canStart}
            onClick={startGame}
          >
            {canStart ? "게임 시작" : "2~5인이 모여야 시작할 수 있어요"}
          </button>
        )}
        {!state.isHost && <p className="text-purple-500 text-sm">방장이 게임을 시작하면 자동으로 시작됩니다</p>}

        {lastError && <p className="text-pink-600 bg-pink-50 rounded-2xl px-3 py-2 text-sm mt-3">{lastError}</p>}
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 gap-6">
      <div className="text-center">
        <h1 className="text-4xl font-display text-purple-700">마법학교</h1>
        <p className="text-sm text-purple-500 mt-1">친구들과 함께 즐기는 마법 학교 보드게임</p>
      </div>

      <input
        className="w-full max-w-sm rounded-2xl border border-purple-200 px-4 py-3 text-purple-800 placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-300"
        placeholder="닉네임을 입력하세요"
        maxLength={10}
        autoComplete="off"
        enterKeyHint="done"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
      />

      <button
        className="w-full max-w-sm rounded-2xl bg-purple-500 text-white font-semibold min-h-12 py-3 disabled:opacity-40"
        disabled={!playerName.trim()}
        onClick={() => createRoom(playerName.trim())}
      >
        새 방 만들기
      </button>

      <div className="w-full max-w-sm flex items-center gap-2">
        <div className="flex-1 h-px bg-purple-200" />
        <span className="text-purple-500 text-sm">또는</span>
        <div className="flex-1 h-px bg-purple-200" />
      </div>

      <div className="w-full max-w-sm flex gap-2">
        <input
          className="flex-1 rounded-2xl border border-purple-200 px-4 py-3 text-purple-800 placeholder-purple-300 uppercase focus:outline-none focus:ring-2 focus:ring-purple-300"
          placeholder="방 코드"
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="go"
          maxLength={4}
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
        />
        <button
          className="rounded-2xl bg-purple-200 text-purple-700 font-semibold min-h-12 px-5 disabled:opacity-40"
          disabled={!playerName.trim() || joinCode.trim().length !== 4}
          onClick={() => joinRoom(joinCode.trim(), playerName.trim())}
        >
          입장
        </button>
      </div>

      {(state.status === "error" || lastError) && (
        <p className="text-pink-600 bg-pink-50 rounded-2xl px-3 py-2 text-sm">{state.errorMessage ?? lastError}</p>
      )}
    </main>
  );
}

export default App;
