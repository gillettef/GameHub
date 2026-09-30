import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "./messages";
import type { ActivityId, GameState } from "./gameTypes";

export interface RoomPlayer {
  id: string;
  name: string;
  isBot?: boolean;
}

interface LobbyState {
  status: "idle" | "connecting" | "in_room" | "error";
  roomCode?: string;
  playerId?: string;
  isHost?: boolean;
  players: RoomPlayer[];
  errorMessage?: string;
}

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
}

export function useGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<LobbyState>({ status: "idle", players: [] });
  const [game, setGame] = useState<GameState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  // 같은 오류가 연달아 와도 화면에 다시 알릴 수 있도록 오류가 올 때마다 늘어나는 번호
  const [errorSeq, setErrorSeq] = useState(0);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  const ensureSocket = useCallback((): WebSocket => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return socketRef.current;
    }
    const socket = new WebSocket(getWebSocketUrl());
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      switch (message.type) {
        case "room_created":
          setState({
            status: "in_room",
            roomCode: message.roomCode,
            playerId: message.playerId,
            isHost: true,
            players: message.players,
          });
          break;
        case "room_joined":
          setState({
            status: "in_room",
            roomCode: message.roomCode,
            playerId: message.playerId,
            isHost: false,
            players: message.players,
          });
          break;
        case "player_joined":
          setState((prev) => ({
            ...prev,
            players: [...prev.players, { id: message.playerId, name: message.playerName, isBot: message.isBot }],
          }));
          break;
        case "player_left":
          setState((prev) => ({ ...prev, players: prev.players.filter((p) => p.id !== message.playerId) }));
          break;
        case "game_state":
          setGame(message.game);
          break;
        case "error":
          setLastError(message.message);
          setErrorSeq((n) => n + 1);
          break;
      }
    };

    socket.onerror = () => {
      setState((prev) => ({ ...prev, status: "error", errorMessage: "서버와 연결할 수 없습니다." }));
    };

    return socket;
  }, []);

  const send = useCallback((socket: WebSocket, message: ClientMessage) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      socket.addEventListener("open", () => socket.send(JSON.stringify(message)), { once: true });
    }
  }, []);

  const createRoom = useCallback(
    (playerName: string) => {
      setState({ status: "connecting", players: [] });
      const socket = ensureSocket();
      send(socket, { type: "create_room", playerName });
    },
    [ensureSocket, send],
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) => {
      setState({ status: "connecting", players: [] });
      const socket = ensureSocket();
      send(socket, { type: "join_room", roomCode, playerName });
    },
    [ensureSocket, send],
  );

  const startGame = useCallback(() => {
    const socket = ensureSocket();
    send(socket, { type: "start_game" });
  }, [ensureSocket, send]);

  const addBot = useCallback(() => {
    send(ensureSocket(), { type: "add_bot" });
  }, [ensureSocket, send]);

  const removeBot = useCallback(
    (botId: string) => {
      send(ensureSocket(), { type: "remove_bot", botId });
    },
    [ensureSocket, send],
  );

  const submitClassChoice = useCallback(
    (keepCardIds: string[]) => {
      const socket = ensureSocket();
      send(socket, { type: "submit_class_choice", keepCardIds });
    },
    [ensureSocket, send],
  );

  const openClassCard = useCallback(() => {
    const socket = ensureSocket();
    send(socket, { type: "open_class_card" });
  }, [ensureSocket, send]);

  const rollDice = useCallback(() => {
    const socket = ensureSocket();
    send(socket, { type: "roll_dice" });
  }, [ensureSocket, send]);

  const selectActivity = useCallback(
    (activityId: ActivityId, targetPlayerId?: string, useStamina?: boolean) => {
      const socket = ensureSocket();
      send(socket, { type: "select_activity", activityId, targetPlayerId, useStamina });
    },
    [ensureSocket, send],
  );

  const chooseLabCard = useCallback(
    (cardId: string | null) => {
      const socket = ensureSocket();
      send(socket, { type: "choose_lab_card", cardId });
    },
    [ensureSocket, send],
  );

  return { state, game, lastError, errorSeq, createRoom, joinRoom, startGame, addBot, removeBot, openClassCard, submitClassChoice, rollDice, selectActivity, chooseLabCard };
}
