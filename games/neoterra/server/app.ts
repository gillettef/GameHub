import { createRoomApp } from '@gamehub/net/server'
// 끊긴 사람의 차례는 60초 뒤 봇이 대신한다(옛 서버와 같다)
import { def } from '../src/def'

export const createApp = () => createRoomApp(def, { awayMs: 60_000 })
