import { useEffect, useState } from 'react';
import type { RoomPeek } from '@rootbound/shared';
import { getNickname, getPlayerToken, getRoomPassword, setRoomPassword } from '../lib/identity';
import { api, connectSocket } from '../socket/client';
import { useGameStore } from '../store/gameStore';

export type Gate = { kind: 'loading' } | { kind: 'nickname' } | { kind: 'password'; message: string | null } | { kind: 'error'; message: string } | { kind: 'joined' };

/**
 * 온라인 방 입장 게이트(RoomPage). 1) 입장 전 확인(REST)으로 닉네임·비밀번호가 필요한지 정하고,
 * 2) 'joined' 가 되면 소켓으로 입장한다. 재연결되면 같은 토큰으로 room:join 을 다시 보내 상태를 통째로 받는다.
 */
export function useRoomGate(roomId: string): { gate: Gate; setGate: (gate: Gate) => void; peek: RoomPeek | null } {
  const applySnapshot = useGameStore((s) => s.applySnapshot);
  const setConnection = useGameStore((s) => s.setConnection);
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  const [peek, setPeek] = useState<RoomPeek | null>(null);

  // 1) 입장 전 확인
  useEffect(() => {
    let alive = true;
    setGate({ kind: 'loading' });
    fetch(`/api/rooms/${roomId}`)
      .then(async (r) => {
        const body = (await r.json()) as RoomPeek | { message: string };
        if (!alive) return;
        if (!r.ok || !('roomId' in body)) {
          setGate({ kind: 'error', message: 'message' in body ? body.message : '없는 방입니다' });
          return;
        }
        setPeek(body);
        if (!getNickname()) setGate({ kind: 'nickname' });
        else if (body.hasPassword && !getRoomPassword(roomId)) setGate({ kind: 'password', message: null });
        else setGate({ kind: 'joined' });
      })
      .catch(() => alive && setGate({ kind: 'error', message: '서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요' }));
    return () => {
      alive = false;
    };
  }, [roomId]);

  // 2) 소켓 입장 + 재접속
  useEffect(() => {
    if (gate.kind !== 'joined') return;
    const socket = connectSocket();
    let cancelled = false;
    const join = async () => {
      setConnection('connecting');
      const res = await api.joinRoom({
        roomId,
        playerToken: getPlayerToken(),
        nickname: getNickname(),
        password: getRoomPassword(roomId) ?? undefined,
      });
      if (cancelled) return;
      if (!res.ok) {
        if (/비밀번호/.test(res.message)) {
          setRoomPassword(roomId, null);
          setGate({ kind: 'password', message: res.message });
        } else setGate({ kind: 'error', message: res.message });
      }
    };
    const onState = (snapshot: Parameters<typeof applySnapshot>[0]) => {
      if (snapshot.room.roomId === roomId) applySnapshot(snapshot);
    };
    const onDisconnect = () => setConnection('disconnected');
    const onClosed = ({ message }: { message: string }) => setGate({ kind: 'error', message });
    socket.on('room:state', onState);
    socket.on('disconnect', onDisconnect);
    socket.on('room:closed', onClosed);
    socket.on('connect', join);
    if (socket.connected) void join();
    return () => {
      cancelled = true;
      socket.off('room:state', onState);
      socket.off('disconnect', onDisconnect);
      socket.off('room:closed', onClosed);
      socket.off('connect', join);
    };
  }, [gate.kind, roomId, applySnapshot, setConnection]);

  return { gate, setGate, peek };
}
