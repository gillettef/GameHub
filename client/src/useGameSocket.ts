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

// 모바일에서 다른 앱을 보고 오면 연결이 끊기므로, 방 정보를 저장해 두었다가 같은 자리로 복귀한다
const SESSION_KEY = "magic-academy-session";
interface Session {
  roomCode: string;
  playerId: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 복귀 기능만 포기한다
  }
}

const HEARTBEAT_INTERVAL_MS = 10_000;
// 이 시간 동안 서버 소식이 하나도 없으면 죽은 연결로 보고 다시 연결한다
const STALE_AFTER_MS = 25_000;
// 화면에 돌아왔을 때 ping에 이 시간 안에 답이 없으면 죽은 연결로 본다
const PING_TIMEOUT_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 30;

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
}

export function useGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<Session | null>(loadSession());
  const [state, setState] = useState<LobbyState>({
    status: sessionRef.current ? "connecting" : "idle",
    players: [],
  });
  const [game, setGame] = useState<GameState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  // 같은 오류가 연달아 와도 화면에 다시 알릴 수 있도록 오류가 올 때마다 늘어나는 번호
  const [errorSeq, setErrorSeq] = useState(0);
  // 연결이 끊겨 다시 붙는 중인지 (화면에 안내를 띄우는 용도)
  const [reconnecting, setReconnecting] = useState(false);

  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const attemptsRef = useRef(0);
  const lastMessageAtRef = useRef(Date.now());
  const unmountedRef = useRef(false);
  // 서로를 부르는 함수들(소켓 생성 ↔ 재연결 예약)을 순환 의존 없이 연결하기 위한 참조
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const ensureSocket = useCallback((): WebSocket => {
    const existing = socketRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return existing;
    }
    const socket = new WebSocket(getWebSocketUrl());
    socketRef.current = socket;
    lastMessageAtRef.current = Date.now();

    // 저장된 방이 있으면 연결되자마자 같은 자리로 복귀를 요청한다 (다른 메시지보다 먼저 보내진다)
    const session = sessionRef.current;
    if (session) {
      socket.addEventListener(
        "open",
        () => socket.send(JSON.stringify({ type: "rejoin_room", roomCode: session.roomCode, playerId: session.playerId } satisfies ClientMessage)),
        { once: true },
      );
    }

    socket.onmessage = (event) => {
      lastMessageAtRef.current = Date.now();
      const message: ServerMessage = JSON.parse(event.data);
      switch (message.type) {
        case "room_created":
          sessionRef.current = { roomCode: message.roomCode, playerId: message.playerId };
          saveSession(sessionRef.current);
          setState({
            status: "in_room",
            roomCode: message.roomCode,
            playerId: message.playerId,
            isHost: true,
            players: message.players,
          });
          break;
        case "room_joined":
          sessionRef.current = { roomCode: message.roomCode, playerId: message.playerId };
          saveSession(sessionRef.current);
          setState({
            status: "in_room",
            roomCode: message.roomCode,
            playerId: message.playerId,
            isHost: false,
            players: message.players,
          });
          break;
        case "room_rejoined":
          attemptsRef.current = 0;
          setReconnecting(false);
          setState({
            status: "in_room",
            roomCode: message.roomCode,
            playerId: message.playerId,
            isHost: message.isHost,
            players: message.players,
          });
          break;
        case "rejoin_failed":
          // 방이 사라졌거나 자리를 잃었으면 처음 화면으로 돌아간다
          sessionRef.current = null;
          saveSession(null);
          setReconnecting(false);
          setGame(null);
          setState({ status: "error", players: [], errorMessage: "이전 게임을 찾을 수 없어요. 새로 시작해 주세요." });
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
        case "host_changed":
          setState((prev) => ({ ...prev, isHost: prev.playerId === message.hostId }));
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
      // 복귀할 방이 있으면 onclose가 재연결을 맡으므로 화면을 오류 상태로 바꾸지 않는다
      if (sessionRef.current) return;
      setState((prev) => ({ ...prev, status: "error", errorMessage: "서버와 연결할 수 없습니다." }));
    };

    socket.onclose = () => {
      // 이미 새 소켓으로 교체됐거나 화면을 떠난 경우에는 무시한다
      if (socketRef.current !== socket || unmountedRef.current) return;
      scheduleReconnectRef.current();
    };

    return socket;
  }, []);

  // 옛 소켓의 이벤트를 떼어 내고 닫은 뒤 새로 연결한다 (끊김을 늦게 알아챈 연결을 즉시 갈아치울 때 사용)
  const forceReconnect = useCallback(() => {
    const old = socketRef.current;
    socketRef.current = null;
    if (old) {
      old.onopen = old.onmessage = old.onerror = old.onclose = null;
      try {
        old.close();
      } catch {
        // 이미 닫힌 소켓이면 무시
      }
    }
    if (reconnectTimerRef.current !== undefined) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    }
    if (!sessionRef.current || unmountedRef.current) return;
    setReconnecting(true);
    ensureSocket();
  }, [ensureSocket]);

  scheduleReconnectRef.current = () => {
    if (!sessionRef.current || reconnectTimerRef.current !== undefined) return;
    if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setReconnecting(false);
      setState((prev) => ({ ...prev, status: "error", errorMessage: "서버와 연결할 수 없습니다. 새로고침해 주세요." }));
      return;
    }
    setReconnecting(true);
    const delay = Math.min(500 * 2 ** attemptsRef.current, 4000);
    attemptsRef.current += 1;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = undefined;
      ensureSocket();
    }, delay);
  };

  useEffect(() => {
    unmountedRef.current = false;
    // 새로고침·탭 복원으로 돌아온 경우 저장된 방으로 복귀를 시도한다
    if (sessionRef.current) ensureSocket();

    // 다른 앱을 보다 화면으로 돌아왔을 때: 끊겼으면 즉시 재연결, 열려 있어 보여도 죽은 연결일 수 있으니 확인한다
    const checkConnection = () => {
      if (document.visibilityState === "hidden" || !sessionRef.current) return;
      const socket = socketRef.current;
      if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        attemptsRef.current = 0;
        forceReconnect();
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      const sentAt = Date.now();
      socket.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
      window.setTimeout(() => {
        if (socketRef.current === socket && lastMessageAtRef.current < sentAt) {
          attemptsRef.current = 0;
          forceReconnect();
        }
      }, PING_TIMEOUT_MS);
    };
    document.addEventListener("visibilitychange", checkConnection);
    window.addEventListener("online", checkConnection);
    window.addEventListener("pageshow", checkConnection);

    // 서버 소식이 끊긴 연결을 걸러내기 위한 주기적 ping
    const heartbeat = window.setInterval(() => {
      const socket = socketRef.current;
      if (!sessionRef.current || document.visibilityState === "hidden" || !socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessageAtRef.current > STALE_AFTER_MS) {
        attemptsRef.current = 0;
        forceReconnect();
        return;
      }
      socket.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      unmountedRef.current = true;
      document.removeEventListener("visibilitychange", checkConnection);
      window.removeEventListener("online", checkConnection);
      window.removeEventListener("pageshow", checkConnection);
      window.clearInterval(heartbeat);
      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [ensureSocket, forceReconnect]);

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
      sessionRef.current = null;
      saveSession(null);
      const socket = ensureSocket();
      send(socket, { type: "create_room", playerName });
    },
    [ensureSocket, send],
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) => {
      setState({ status: "connecting", players: [] });
      sessionRef.current = null;
      saveSession(null);
      const socket = ensureSocket();
      send(socket, { type: "join_room", roomCode, playerName });
    },
    [ensureSocket, send],
  );

  // 방(게임)에서 나가 처음 화면으로 돌아간다. 저장된 방 정보를 지워 자동 재접속으로 다시 들어오지 않게 한다
  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "leave_room" } satisfies ClientMessage));
    sessionRef.current = null;
    saveSession(null);
    if (reconnectTimerRef.current !== undefined) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    }
    attemptsRef.current = 0;
    setReconnecting(false);
    setGame(null);
    setLastError(null);
    setState({ status: "idle", players: [] });
  }, []);

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

  const takeClassCard = useCallback(
    (cardId: string | null) => {
      const socket = ensureSocket();
      send(socket, { type: "take_class_card", cardId });
    },
    [ensureSocket, send],
  );

  const rollDice = useCallback(() => {
    const socket = ensureSocket();
    send(socket, { type: "roll_dice" });
  }, [ensureSocket, send]);

  const rerollDice = useCallback(
    (diceIndexes: number[]) => {
      const socket = ensureSocket();
      send(socket, { type: "reroll_dice", diceIndexes });
    },
    [ensureSocket, send],
  );

  const confirmRoll = useCallback(() => {
    const socket = ensureSocket();
    send(socket, { type: "confirm_roll" });
  }, [ensureSocket, send]);

  const selectActivity = useCallback(
    (activityId: ActivityId, targetPlayerId?: string) => {
      const socket = ensureSocket();
      send(socket, { type: "select_activity", activityId, targetPlayerId });
    },
    [ensureSocket, send],
  );

  const keepToken = useCallback(
    (choice: "intelligence" | "stamina" | "none") => {
      const socket = ensureSocket();
      send(socket, { type: "keep_token", choice });
    },
    [ensureSocket, send],
  );

  const pickActivityCard = useCallback(
    (cardId: string | null) => {
      const socket = ensureSocket();
      send(socket, { type: "pick_activity_card", cardId });
    },
    [ensureSocket, send],
  );

  return { state, game, lastError, errorSeq, reconnecting, createRoom, joinRoom, leaveRoom, startGame, addBot, removeBot, takeClassCard, rollDice, rerollDice, confirmRoll, selectActivity, pickActivityCard, keepToken };
}
