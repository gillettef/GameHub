import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "./messages";

export interface RoomPlayer {
  id: string;
  name: string;
}

interface GameState {
  status: "idle" | "connecting" | "in_room" | "error";
  roomCode?: string;
  playerId?: string;
  players: RoomPlayer[];
  errorMessage?: string;
}

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
}

export function useGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<GameState>({ status: "idle", players: [] });

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
          setState({ status: "in_room", roomCode: message.roomCode, playerId: message.playerId, players: [] });
          break;
        case "room_joined":
          setState({
            status: "in_room",
            roomCode: message.roomCode,
            playerId: message.playerId,
            players: message.players,
          });
          break;
        case "player_joined":
          setState((prev) => ({
            ...prev,
            players: [...prev.players, { id: message.playerId, name: message.playerName }],
          }));
          break;
        case "player_left":
          setState((prev) => ({ ...prev, players: prev.players.filter((p) => p.id !== message.playerId) }));
          break;
        case "error":
          setState((prev) => ({ ...prev, status: "error", errorMessage: message.message }));
          break;
      }
    };

    socket.onerror = () => {
      setState((prev) => ({ ...prev, status: "error", errorMessage: "서버와 연결할 수 없습니다." }));
    };

    return socket;
  }, []);

  const send = useCallback(
    (socket: WebSocket, message: ClientMessage) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      } else {
        socket.addEventListener("open", () => socket.send(JSON.stringify(message)), { once: true });
      }
    },
    [],
  );

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

  return { state, createRoom, joinRoom };
}
