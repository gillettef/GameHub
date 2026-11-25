import { createRoomApp } from '@gamehub/net/server'
import { def } from '../src/def'

// 접속이 끊긴 사람의 차례는 봇이 대신하지 않고 돌아올 때까지 기다린다(옛 서버와 같다, notes/기획_정리.md 37절)
export const createApp = () => createRoomApp(def, { awayMs: null })
