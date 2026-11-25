import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LocalState } from './local'
import { RoomClient, type RoomClientOptions, type RoomState } from './room'

/** 주소의 ?room= 초대 코드 */
export function invitedCode(search: string): string | null {
  return new URLSearchParams(search).get('room')?.trim().toUpperCase() || null
}

/** 온라인 접속 하나. 다른 방의 초대 링크로 연 것이 아니면 저장해 둔 자리로 자동 복귀한다 */
export function useRoom<V, A>(opts: RoomClientOptions): [RoomState<V>, RoomClient<V, A>] {
  const [client] = useState(() => new RoomClient<V, A>(opts))
  const state = useSyncExternalStore(client.subscribe, client.getState)
  useEffect(() => {
    const invited = invitedCode(location.search)
    const saved = client.savedSession()
    if (saved && (!invited || invited === saved.code)) client.resume(saved)
    const onVisible = () => {
      if (document.visibilityState === 'visible') client.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      client.dispose()
    }
  }, [client])
  return [state, client]
}

interface LocalSource<V> {
  getState(): LocalState<V>
  subscribe(listener: () => void): () => void
  start(): void
  dispose(): void
}

export function useLocalGame<V>(game: LocalSource<V>): LocalState<V> {
  const state = useSyncExternalStore(game.subscribe, game.getState)
  useEffect(() => {
    game.start()
    return () => game.dispose()
  }, [game])
  return state
}
