#!/usr/bin/env node
// 게임 폴더에서 실행: 빌드 결과를 운영과 같은 방식(허브 안 실행, /<slug>/)으로 띄운다.
//   gamehub-serve            → 현재 폴더, 포트 PORT 또는 8080
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const { createHub } = await import(pathToFileURL(path.resolve(here, '../../hub/server.mjs')).href)

const dir = path.resolve(process.argv[2] ?? '.')
const slug = path.basename(dir)
const port = Number(process.env.PORT ?? 8080)
const hub = await createHub({ games: [{ slug, name: slug, mode: 'inproc' }], gamesDir: path.dirname(dir) })
if (hub.runtime.get(slug).mode !== 'inproc') process.exit(1)
hub.server.listen(port, () => console.log(`http://localhost:${port}/${slug}/`))
