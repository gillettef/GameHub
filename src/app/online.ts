/**
 * 온라인 대전 클라이언트 (로드맵 8단계). 서버와 행동 기록을 맞춘다.
 *
 * 내 행동은 먼저 로컬 기록에 붙이고 서버로 보낸다. 서버가 검증 후 모두에게 보내면,
 * 이미 아는 부분은 건너뛰고 새 부분만 붙인다. 어긋나면 다시 들어가 전체 기록을 받는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Action, LawId } from '../engine'
import type { ClientMessage, ServerMessage } from './protocol'
import type { Seat, Session } from './session'

export type OnlineStatus = 'idle' | 'connecting' | 'open' | 'closed'

export interface OnlineApi {
  status: OnlineStatus
  error: string | null
  /** 방에 들어오면 그 세션 (OnlineScreen이 게임 화면으로 넘어갈 때 씀) */
  joined: Session | null
  claimed: boolean[]
  /** 자리별 접속 여부 (봇 자리는 true) */
  presence: boolean[]
  create: (seats: Seat[], law: LawId | 'random') => void
  join: (room: string, name: string) => void
  send: (action: Action, index: number) => void
  leave: () => void
}

/** 토큰을 붙이기 전의 메시지 (유니온의 각 형태마다 token을 뺀다) */
type Unsigned = ClientMessage extends infer M ? (M extends ClientMessage ? Omit<M, 'token'> : never) : never

const TOKEN_KEY = 'tesseract.token'

function deviceToken(): string {
  try {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (saved) return saved
    const token = crypto.randomUUID()
    localStorage.setItem(TOKEN_KEY, token)
    return token
  } catch {
    return crypto.randomUUID()
  }
}

/** 서버 주소: VITE_SERVER_URL, 개발 서버(5173)면 같은 호스트의 8787, 아니면 같은 주소 */
export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined
  if (env) return env
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const host = location.port === '5173' ? `${location.hostname}:8787` : location.host
  return `${scheme}://${host}/ws`
}

export function useOnline(session: Session | null, setSession: (s: Session) => void): OnlineApi {
  const [status, setStatus] = useState<OnlineStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState<Session | null>(null)
  const [claimed, setClaimed] = useState<boolean[]>([])
  const [presence, setPresence] = useState<boolean[]>([])
  const ws = useRef<WebSocket | null>(null)
  /** 끊겼을 때 다시 연결할 타이머와 몇 번째 시도인지 */
  const retry = useRef<{ timer: number | null; attempt: number }>({ timer: null, attempt: 0 })
  /** 사용자가 나가기를 눌렀으면 다시 연결하지 않는다 */
  const leaving = useRef(false)
  const queue = useRef<ClientMessage[]>([])
  const token = useRef<string>('')
  const latest = useRef<Session | null>(session)
  const lastJoin = useRef<{ room: string; name: string } | null>(null)

  useEffect(() => {
    latest.current = session
  }, [session])

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.t) {
        case 'joined': {
          const s: Session = {
            v: 2,
            id: msg.snapshot.id,
            createdAt: msg.snapshot.createdAt,
            config: msg.snapshot.config,
            seats: msg.snapshot.seats,
            actions: msg.snapshot.actions,
            room: msg.room,
            localSeats: msg.you,
          }
          lastJoin.current = { room: msg.room, name: msg.snapshot.seats[msg.you[0] ?? 0]?.name ?? '' }
          setClaimed(msg.snapshot.claimed)
          setPresence(msg.snapshot.online)
          setError(null)
          setJoined(s)
          setSession(s)
          return
        }
        case 'seats': {
          setClaimed(msg.claimed)
          setPresence(msg.online)
          const s = latest.current
          if (s && s.room === msg.room) setSession({ ...s, seats: msg.seats })
          return
        }
        case 'actions': {
          const s = latest.current
          if (!s || s.room !== msg.room) return
          const known = s.actions.length
          if (msg.from > known) {
            // 빠진 행동이 있다: 다시 들어가 전체 기록을 받는다
            resync()
            return
          }
          const fresh = msg.actions.slice(known - msg.from)
          if (fresh.length > 0) setSession({ ...s, actions: [...s.actions, ...fresh] })
          return
        }
        case 'error':
          setError(msg.message)
          // 내 행동이 거절됐으면 로컬 기록이 어긋났으므로 맞춘다
          if (latest.current?.room) resync()
          return
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSession],
  )

  const connect = useCallback((): WebSocket => {
    if (ws.current && ws.current.readyState <= WebSocket.OPEN) return ws.current
    token.current ||= deviceToken()
    setStatus('connecting')
    const socket = new WebSocket(serverUrl())
    socket.onopen = () => {
      setStatus('open')
      setError(null)
      retry.current.attempt = 0
      for (const m of queue.current.splice(0)) socket.send(JSON.stringify(m))
    }
    socket.onclose = () => {
      if (ws.current !== socket) return
      ws.current = null
      setStatus('closed')
      // 방에 들어가 있었으면 점점 길게 기다리며 다시 들어간다 (1, 2, 4, 8초, 최대 10초)
      if (!leaving.current && latest.current?.room) scheduleRetry()
    }
    socket.onerror = () => {
      if (!latest.current?.room) setError('서버에 연결할 수 없습니다.')
    }
    socket.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as ServerMessage)
      } catch {
        setError('서버 메시지를 읽을 수 없습니다.')
      }
    }
    ws.current = socket
    return socket
    // scheduleRetry는 ref만 쓰므로 렌더마다 바뀌어도 괜찮다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage])

  const post = useCallback(
    (msg: Unsigned) => {
      const socket = connect()
      const full = { ...msg, token: token.current } as ClientMessage
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(full))
      else queue.current.push(full)
    },
    [connect],
  )

  function scheduleRetry() {
    if (retry.current.timer !== null) return
    const delay = Math.min(10_000, 1000 * 2 ** retry.current.attempt)
    retry.current.attempt += 1
    retry.current.timer = window.setTimeout(() => {
      retry.current.timer = null
      resync()
    }, delay)
  }

  // 화면이 다시 보이거나 네트워크가 돌아오면 기다리지 않고 바로 다시 들어간다
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'hidden' || leaving.current || !latest.current?.room) return
      if (ws.current && ws.current.readyState <= WebSocket.OPEN) return
      if (retry.current.timer !== null) window.clearTimeout(retry.current.timer)
      retry.current.timer = null
      resync()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resync() {
    const s = latest.current
    if (s?.room) post({ t: 'join', room: s.room, name: lastJoin.current?.name ?? '' })
  }

  // 저장된 온라인 세션이 있으면 다시 연결
  useEffect(() => {
    if (session?.room && status === 'idle') resync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.room, status])

  return {
    status,
    error,
    joined,
    claimed,
    presence,
    create: (seats, law) => {
      leaving.current = false
      post({ t: 'create', seats, law })
    },
    join: (room, name) => {
      leaving.current = false
      post({ t: 'join', room: room.trim().toUpperCase(), name })
    },
    send: (action, index) => {
      const room = latest.current?.room
      if (room) post({ t: 'action', room, index, action })
    },
    leave: () => {
      leaving.current = true
      if (retry.current.timer !== null) window.clearTimeout(retry.current.timer)
      retry.current = { timer: null, attempt: 0 }
      queue.current = []
      const socket = ws.current
      ws.current = null
      socket?.close()
      setJoined(null)
      setStatus('idle')
    },
  }
}
