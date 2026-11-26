/**
 * 육각 판 19장(앞뒤)을 실물 크기로 인쇄하는 시제품 파일 → design/print/tiles.html
 * 실행: npx tsx tools/tiles-print.ts (게임 폴더에서). 판 데이터는 src/engine/tiles.ts
 *
 * A4 한 장에 판 4장. 앞면 쪽 다음에 뒷면 쪽이 오고, 뒷면은 좌우를 바꿔 놓아 긴 변 양면 인쇄로 앞뒤가 맞는다.
 * 판 크기: 마주 보는 변 사이 100mm(docs/design.md 10-1).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TILES, TILE_R, type TileFace } from '../src/engine/tiles'

const AP = (TILE_R * Math.sqrt(3)) / 2
const rad = (d: number) => (d * Math.PI) / 180
const f1 = (x: number) => Math.round(x * 10) / 10
const corners = (r = TILE_R) => Array.from({ length: 6 }, (_, k) => `${f1(r * Math.cos(rad(60 * k - 30)))},${f1(r * Math.sin(rad(60 * k - 30)))}`).join(' ')
const port = (e: number) => [AP * Math.cos(rad(60 * e)), AP * Math.sin(rad(60 * e))] as const

type Set = 'castle' | 'camp' | 'ruin' | 'forest'
const FILL: Record<Set, [string, string]> = { castle: ['#4a3a63', '#2a1f38'], ruin: ['#6b645b', '#46403a'], forest: ['#55704a', '#34492c'], camp: ['#55704a', '#34492c'] }
const ROAD: Record<number, string> = { 1: '#8a6a42', 2: '#8b8278', 3: '#7c6a96', 4: '#c9a24c' }
const KIND_KO: Record<Set, string> = { castle: '성 판', camp: '야영지 판', ruin: '폐허 판', forest: '숲 판' }

function lcg(seed: number) {
  let a = seed >>> 0 || 1
  return () => (a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296
}

function faceSvg(set: Set, idx: number, side: number, f: TileFace): string {
  const rnd = lcg(idx * 977 + side * 31 + set.length * 7)
  const [hi, lo] = FILL[set]
  const id = `${set}${idx}${side}`
  const o: string[] = []
  o.push(`<defs><radialGradient id="g${id}" cx="45%" cy="40%" r="75%"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></radialGradient></defs>`)
  o.push(`<polygon points="${corners()}" fill="url(#g${id})"/>`)
  if (set === 'castle') o.push(`<circle r="78" fill="none" stroke="#7a5b20" stroke-width="6" stroke-dasharray="6 5"/>`)
  for (const d of f.deco) {
    if (d.type === 'lake' || d.type === 'pool') o.push(`<ellipse cx="${d.x}" cy="${d.y}" rx="${f1(24 * d.s)}" ry="${f1(16 * d.s)}" fill="#2a4a66" stroke="#16283a" stroke-width="2.5"/>`)
    if (d.type === 'peak')
      for (let m = 0; m < 3; m++) {
        const px = d.x + (m - 1) * 13 * d.s
        const py = d.y + (m === 1 ? -4 : 3)
        const s = (m === 1 ? 15 : 11) * d.s
        o.push(`<path d="M${f1(px - s)} ${f1(py + s * 0.6)}L${f1(px)} ${f1(py - s)}L${f1(px + s)} ${f1(py + s * 0.6)}Z" fill="#5a5056" stroke="#241c22" stroke-width="1.2"/>`)
      }
    if (d.type === 'rubble')
      for (let m = 0; m < 6; m++) {
        const px = d.x + (rnd() - 0.5) * 30 * d.s
        const py = d.y + (rnd() - 0.5) * 22 * d.s
        o.push(`<rect x="${f1(px - 3)}" y="${f1(py - 2)}" width="6" height="4" fill="#7a7068" stroke="#2d2723" stroke-width=".8"/>`)
      }
  }
  // 나무·돌
  for (let k = 0; k < 70; k++) {
    const x = (rnd() - 0.5) * 170
    const y = (rnd() - 0.5) * 190
    const inside = [0, 60, 120, 180, 240, 300].every((a) => x * Math.cos(rad(a)) + y * Math.sin(rad(a)) < AP - 7)
    if (!inside || set === 'castle' || f.cells.some((c) => Math.hypot(c.x - x, c.y - y) < 23)) continue
    if (f.deco.some((d) => Math.hypot(d.x - x, d.y - y) < 30 * d.s)) continue
    const s = 3.5 + rnd() * 3
    if (set === 'ruin') {
      if (rnd() < 0.5) o.push(`<rect x="${f1(x - s / 2)}" y="${f1(y - s / 2)}" width="${f1(s)}" height="${f1(s * 0.75)}" fill="#7a7068" stroke="#2d2723" stroke-width=".7"/>`)
    } else o.push(`<path d="M${f1(x)} ${f1(y - s * 1.6)}L${f1(x + s)} ${f1(y + s * 0.4)}L${f1(x - s)} ${f1(y + s * 0.4)}ZM${f1(x)} ${f1(y - s * 0.6)}L${f1(x + s * 1.2)} ${f1(y + s * 1.3)}L${f1(x - s * 1.2)} ${f1(y + s * 1.3)}Z" fill="#2f4a2b" stroke="#16210f" stroke-width=".7"/>`)
  }
  // 길: 칸-칸, 칸-변 가운데 출구
  const road = (d: string, ring: number, rough: boolean) => {
    o.push(`<path d="${d}" fill="none" stroke="#14100c" stroke-width="8" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${ROAD[ring]}" stroke-width="4.4" stroke-linecap="round"/>`)
    if (rough) o.push(`<path d="${d}" fill="none" stroke="#a8433b" stroke-width="7" stroke-dasharray="1.6 4.5"/>`)
  }
  for (const [i, j, rough] of f.roads) {
    const a = f.cells[i] as TileFace['cells'][number]
    const b = f.cells[j] as TileFace['cells'][number]
    road(`M${a.x} ${a.y}L${b.x} ${b.y}`, Math.min(a.ring, b.ring), rough === 1)
  }
  f.ports.forEach((p, e) => {
    const c = f.cells[p.cell] as TileFace['cells'][number]
    const [px, py] = port(e)
    road(`M${c.x} ${c.y}L${f1(px)} ${f1(py)}`, c.ring, p.rough === 1)
    o.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="3.2" fill="#f2d98e" stroke="#14100c" stroke-width="1"/>`)
  })
  // 칸: 칸 타일(지름 약 17mm)을 올려놓는 자리
  for (const c of f.cells) {
    const r = c.ring === 4 ? 19 : 15
    o.push(`<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#efe6d4" fill-opacity=".14" stroke="${c.ring >= 3 ? '#c9a24c' : '#efe6d4'}" stroke-width="1.4" stroke-dasharray="${c.ring === 4 ? '' : '3 2'}"/>`)
    if (c.camp) o.push(`<use href="#bc-tile-camp" x="${c.x - 10}" y="${c.y - 10}" width="20" height="20" style="color:#ffb44a"/>`)
    if (c.ring === 4) o.push(`<use href="#bc-tile-throne" x="${c.x - 12}" y="${c.y - 12}" width="24" height="24" style="color:#f2d98e"/>`)
  }
  o.push(`<polygon points="${corners()}" fill="none" stroke="#000" stroke-width=".6"/>`)
  o.push(`<text y="${f1(TILE_R - 14)}" text-anchor="middle" class="nm">${f.name}</text>`)
  o.push(`<text y="${f1(TILE_R - 6)}" text-anchor="middle" class="sd">${KIND_KO[set]} · ${side ? '뒤' : '앞'}</text>`)
  // 너비 = 마주 보는 변 사이 = 100mm
  return `<svg class="tile" width="100mm" height="${f1((100 * 2) / Math.sqrt(3))}mm" viewBox="${f1(-AP)} ${-TILE_R} ${f1(2 * AP)} ${2 * TILE_R}">${o.join('')}</svg>`
}

const faces: { set: Set; idx: number }[] = [
  { set: 'castle', idx: 0 },
  { set: 'camp', idx: 0 },
  ...TILES.ruin.map((_, idx) => ({ set: 'ruin' as Set, idx })),
  ...TILES.forest.map((_, idx) => ({ set: 'forest' as Set, idx })),
]
const pages: string[] = []
for (let i = 0; i < faces.length; i += 4) {
  const group = faces.slice(i, i + 4)
  const svgs = (side: number) => group.map(({ set, idx }) => faceSvg(set, idx, side, (TILES[set][idx] as [TileFace, TileFace])[side] as TileFace))
  const front = svgs(0)
  const back = svgs(1)
  // 뒷면: 같은 줄에서 좌우를 바꾼다(긴 변 양면 인쇄)
  const mirrored = back.map((_, k) => back[k % 2 === 0 ? k + 1 : k - 1] ?? '<div class="slot"></div>')
  pages.push(`<section class="page"><h2>앞면 ${i / 4 + 1}</h2><div class="grid">${front.join('')}</div></section>`)
  pages.push(`<section class="page"><h2>뒷면 ${i / 4 + 1}</h2><div class="grid">${mirrored.join('')}</div></section>`)
}

const sprite = readFileSync(fileURLToPath(new URL('../design/emblems.svg', import.meta.url)), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>검은 왕관 육각 판 인쇄</title>
<style>
@page { size: A4; margin: 0; }
body { margin: 0; background: #ddd; font-family: system-ui, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; }
.note { max-width: 190mm; margin: 8mm auto; font-size: 12px; line-height: 1.6; }
.page { width: 210mm; height: 297mm; margin: 0 auto 6mm; background: #fff; box-sizing: border-box; padding: 10mm 3mm; page-break-after: always; break-after: page; }
.page h2 { margin: 0 0 3mm; font-size: 9pt; color: #888; text-align: center; }
.grid { display: grid; grid-template-columns: 100mm 100mm; gap: 6mm 4mm; justify-content: center; }
.slot { width: 100mm; }
.tile text { paint-order: stroke; stroke: #14100c; stroke-width: 2.4px; stroke-linejoin: round; }
.tile .nm { font: 700 9px sans-serif; fill: #f6efe0; }
.tile .sd { font: 6px sans-serif; fill: #d8cdb8; }
@media print { body { background: none; } .note { display: none; } .page { margin: 0; } }
</style></head><body>
${sprite}
<div class="note">
<b>검은 왕관 육각 판 19장 시제품</b> — 판 데이터: <code>src/engine/tiles.ts</code>, 이 파일은 <code>npx tsx tools/tiles-print.ts</code> 로 다시 만든다.<br>
A4, 배율 100%(실제 크기), <b>긴 변 양면 인쇄</b>. 판은 마주 보는 변 사이 100mm. 외곽선을 따라 잘라 두꺼운 판지에 붙인다.<br>
점선 원은 칸 타일 자리, 노란 점은 변 가운데 출구, 빨간 눈금은 험한 길(지날 때 이동 +1)이다.
</div>
${pages.join('\n')}
</body></html>
`
const dir = fileURLToPath(new URL('../design/print/', import.meta.url))
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}tiles.html`, html)
console.log(`design/print/tiles.html: 판 ${faces.length}장, A4 ${pages.length}쪽`)
