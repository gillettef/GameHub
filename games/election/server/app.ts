// 온라인 대결(WebSocket /ws, /health). 공통 방 서버(@gamehub/net)에 유세 대작전 GameDef 를 붙인다.
// 허브(scripts/aws/hub-entry.mjs → server-dist/app.cjs)와 개발 서버(vite)가 함께 쓴다.
import { createRoomApp } from '@gamehub/net/server'
import { def } from '../src/def'

export const createApp = () => createRoomApp(def)
