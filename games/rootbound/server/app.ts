import { randomInt } from 'node:crypto'
import { createRoomApp } from '@gamehub/net/server'
import { makeDef } from '../src/def'

// 카드 더미 셔플 키는 보드 시드와 따로 암호학적 난수로 만든다(공개된 보드·목표로 손패를 역산하지 못하게)
const def = makeDef({ deckKey: () => [0, 1, 2, 3].map(() => randomInt(0, 2 ** 32)) })

export const createApp = () => createRoomApp(def)
