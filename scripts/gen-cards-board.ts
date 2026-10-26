// 앱의 카드 데이터(cardArtData.ts)로 Claude Design 캔버스의 「카드 v2」 보드(.dc.html)를 만든다.
// 실행: npx tsx scripts/gen-cards-board.ts <출력 경로>  → 캔버스의 project/CardsV2.dc.html 로 올린다
import { writeFileSync } from 'node:fs'
import { EVENT_DECK, LAW_DECK, PERSONAL_GOAL_DECK, ROUND_GOALS, type RoundGoalId } from '../src/engine'
import { ART_H, ART_W, cardArt, cardInfo, cardStars, type ArtShape, type CardKey } from '../src/ui/cardArtData'
import { BLANK_FACE, DIE_COLORS } from '../src/ui/colors'

const out = process.argv[2] as string
const HOURGLASS = 'M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => Math.round(v * 100) / 100

function shape(s: ArtShape, tone: string): string {
  switch (s.t) {
    case 'die': {
      // ⧗ 면은 무색 (§2 v0.7)
      const c = s.f === 't' ? BLANK_FACE : DIE_COLORS[s.c]
      const r = n(s.s * 0.22)
      const face =
        s.f === 't'
          ? `<path d="${HOURGLASS}" transform="translate(${n(s.x + s.s * 0.2)} ${n(s.y + s.s * 0.2)}) scale(${n((s.s * 0.6) / 24)})" fill="none" stroke="${c.ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>`
          : s.f !== undefined
            ? `<text x="${n(s.x + s.s / 2)}" y="${n(s.y + s.s * 0.7)}" text-anchor="middle" font-size="${n(s.s * 0.56)}" font-weight="700" font-family="Space Grotesk, sans-serif" fill="${c.ink}">${s.f}</text>`
            : ''
      const hi = s.hi ? `<rect x="${s.x - 2}" y="${s.y - 2}" width="${s.s + 4}" height="${s.s + 4}" rx="${n(r + 2)}" fill="none" stroke="${tone}" stroke-width="1.2" opacity="0.9"></rect>` : ''
      return `<g opacity="${s.dim ? 0.38 : 1}">${hi}<rect x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" rx="${r}" fill="${c.fill}" stroke="${c.stroke ?? c.dark}" stroke-width="0.8"></rect><rect x="${n(s.x + s.s * 0.12)}" y="${n(s.y + s.s * 0.08)}" width="${n(s.s * 0.76)}" height="${n(s.s * 0.18)}" rx="${n(s.s * 0.09)}" fill="#ffffff" opacity="0.18"></rect>${face}</g>`
    }
    case 'slot':
      return `<rect x="${s.x + 0.5}" y="${s.y + 0.5}" width="${s.s - 1}" height="${s.s - 1}" rx="${n(s.s * 0.22)}" fill="none" stroke="#6d6890" stroke-width="0.8" stroke-dasharray="2 2"></rect>`
    case 'line':
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.tone ? tone : '#a49fc4'}" stroke-width="1"${s.dash ? ' stroke-dasharray="3 3"' : ''} opacity="0.8"></line>`
    case 'circle':
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill ?? 'none'}" stroke="${s.tone ? tone : (s.stroke ?? 'none')}" stroke-width="${s.sw ?? 0}"></circle>`
    case 'path':
      return `<path d="${s.d}" fill="${s.fill ?? 'none'}" stroke="${s.tone ? tone : (s.stroke ?? 'none')}" stroke-width="${s.sw ?? 1}" stroke-linecap="round" stroke-linejoin="round"></path>`
    case 'label':
      return `<text x="${s.x}" y="${s.y}" text-anchor="middle" font-size="${s.size}" font-weight="700" font-family="Space Grotesk, Noto Sans KR, sans-serif" fill="${s.tone ? tone : '#ece9ff'}">${esc(s.text)}</text>`
  }
}

let gid = 0
function art(card: CardKey, tone: string): string {
  const id = `g${++gid}`
  const stars = cardStars(`${card.kind}:${card.id}`)
    .map((st) => `<circle cx="${n(st.x)}" cy="${n(st.y)}" r="${n(st.r)}" fill="#ffffff" opacity="${n(st.o)}"></circle>`)
    .join('')
  return `<svg viewBox="0 0 ${ART_W} ${ART_H}" style="display: block; width: 100%; height: 100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><radialGradient id="a${id}" cx="28%" cy="22%" r="75%"><stop offset="0%" stop-color="${tone}" stop-opacity="0.55"></stop><stop offset="60%" stop-color="${tone}" stop-opacity="0.08"></stop><stop offset="100%" stop-color="${tone}" stop-opacity="0"></stop></radialGradient><radialGradient id="b${id}" cx="85%" cy="95%" r="60%"><stop offset="0%" stop-color="#5ad1e6" stop-opacity="0.22"></stop><stop offset="100%" stop-color="#5ad1e6" stop-opacity="0"></stop></radialGradient></defs><rect width="${ART_W}" height="${ART_H}" fill="#0b0a14"></rect><rect width="${ART_W}" height="${ART_H}" fill="url(#a${id})"></rect><rect width="${ART_W}" height="${ART_H}" fill="url(#b${id})"></rect>${stars}${cardArt(card).map((s) => shape(s, tone)).join('')}</svg>`
}

const clip = (cut: number) => `polygon(${cut}px 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%, 0 ${cut}px)`
const HEX = 'polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%)'
const hex = (v: string, tone: string, size: number) =>
  `<span style="display: inline-flex; align-items: center; justify-content: center; width: ${n(size * 1.12)}px; height: ${size}px; clip-path: ${HEX}; background: linear-gradient(160deg, #ffffff88, ${tone} 45%); color: #14121f; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: ${n(size * 0.5)}px">${v}</span>`
const ticks = (tone: string) =>
  [
    'top: 4px; left: 4px; border-top: 1px solid; border-left: 1px solid',
    'top: 4px; right: 4px; border-top: 1px solid; border-right: 1px solid',
    'bottom: 4px; left: 4px; border-bottom: 1px solid; border-left: 1px solid',
    'bottom: 4px; right: 4px; border-bottom: 1px solid; border-right: 1px solid',
  ]
    .map((p) => `<span style="position: absolute; width: 8px; height: 8px; ${p}; border-color: ${tone}"></span>`)
    .join('')
const artWindow = (card: CardKey, tone: string, extra = '') =>
  `<div style="position: relative; overflow: hidden; aspect-ratio: 3 / 2; box-shadow: inset 0 0 0 1px ${tone}55; ${extra}">${art(card, tone)}${ticks(tone)}</div>`

function frame(card: CardKey, cut: number, width: string, inner: string): string {
  const { tone } = cardInfo(card)
  return `<div style="width: ${width}; box-sizing: border-box; padding: 1px; clip-path: ${clip(cut)}; background: linear-gradient(150deg, ${tone}, #34304d 40%, #34304d 70%, ${tone}99)"><div style="position: relative; height: 100%; background: #1f1c30; background-image: linear-gradient(165deg, ${tone}24, transparent 45%); clip-path: ${clip(cut - 0.5)}"><div style="position: absolute; left: 0; right: 0; top: 0; height: 4px; background: ${tone}"></div>${inner}</div></div>`
}

function mini(card: CardKey, width = 132): string {
  const i = cardInfo(card)
  const pts = i.points[0] ? hex(i.points[0].value, i.tone, 18) : ''
  return frame(
    card,
    8,
    `${width}px`,
    `<div style="display: flex; flex-direction: column; gap: 6px; padding: 10px 6px 6px"><div style="display: flex; align-items: center; justify-content: space-between; padding: 0 2px; font-size: 12px; font-weight: 700; color: ${i.tone}"><span>${i.short}</span>${pts}</div>${artWindow(card, i.tone)}<span style="padding: 0 2px; font-size: 13px; font-weight: 700; line-height: 1.25; color: #ece9ff">${esc(i.name)}</span></div>`,
  )
}

function normal(card: CardKey, width = 400): string {
  const i = cardInfo(card)
  const pts = i.points.map((p) => `<span style="display: inline-flex; align-items: center; gap: 4px">${hex(p.value, i.tone, 20)}<span style="font-size: 12px; font-weight: 700; color: #a49fc4">${p.label}</span></span>`).join('')
  return frame(
    card,
    12,
    `${width}px`,
    `<div style="display: flex; gap: 12px; padding: 16px 10px 10px">${artWindow(card, i.tone, 'width: 132px; flex-shrink: 0; align-self: flex-start')}<div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex-grow: 1"><div style="display: flex; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: ${i.tone}"><span>${i.kind}</span><span style="font-family: 'Space Grotesk', sans-serif; letter-spacing: 0; opacity: 0.8">${i.tag}</span></div><div style="font-family: 'Space Grotesk', 'Noto Sans KR', sans-serif; font-size: 17px; font-weight: 700; line-height: 1.35; color: #ece9ff">${esc(i.name)}</div><div style="font-size: 13px; line-height: 1.6; color: #a49fc4">${esc(i.text)}</div>${pts ? `<div style="display: flex; gap: 8px; margin-top: 4px">${pts}</div>` : ''}</div></div>`,
  )
}

function large(card: CardKey, width = 340): string {
  const i = cardInfo(card)
  const slots = i.points
    .map(
      (p) =>
        `<div style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 0; border-radius: 12px; border: 2px dashed ${i.tone}88">${hex(p.value, i.tone, 30)}<span style="font-size: 14px; font-weight: 700; color: #a49fc4">${p.label}</span></div>`,
    )
    .join('')
  return frame(
    card,
    16,
    `${width}px`,
    `<div style="display: flex; flex-direction: column; gap: 12px; padding: 22px 16px 16px"><div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; letter-spacing: 0.1em; color: ${i.tone}"><span>${i.kind}</span><span style="font-family: 'Space Grotesk', sans-serif; letter-spacing: 0">${i.tag}</span></div>${artWindow(card, i.tone)}<div style="font-family: 'Space Grotesk', 'Noto Sans KR', sans-serif; font-size: 24px; font-weight: 700; line-height: 1.2; color: #ece9ff">${esc(i.name)}</div><div style="font-size: 15px; line-height: 1.6; color: #e1ddf5">${esc(i.text)}</div>${i.note ? `<div style="font-size: 12px; color: #a49fc4">${esc(i.note)}</div>` : ''}${slots ? `<div style="display: flex; gap: 8px">${slots}</div>` : ''}</div>`,
  )
}

const back = `<div style="width: 340px; height: 486px; box-sizing: border-box; padding: 1px; clip-path: ${clip(16)}; background: linear-gradient(150deg, #9b8cff, #34304d 45%, #5ad1e6)"><div style="height: 100%; clip-path: ${clip(15.5)}; background: radial-gradient(120% 80% at 30% 20%, #9b8cff33, transparent 60%), radial-gradient(90% 70% at 90% 100%, #5ad1e626, transparent 60%), #14121f; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px"><svg width="132" height="132" viewBox="0 0 64 64" fill="none" stroke-width="2.2" role="img" aria-label="테서랙트 문양"><rect x="12" y="12" width="28" height="28" rx="4" stroke="#9b8cff"></rect><rect x="24" y="24" width="28" height="28" rx="4" stroke="#e8e4ff"></rect><path d="M12 12l12 12M40 12l12 12M12 40l12 12M40 40l12 12" stroke="#9b8cff"></path></svg><div style="font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: 0.35em; color: #ece9ff">TESSERACT</div><div style="font-size: 12px; color: #a49fc4">카드 뒷면</div></div></div>`

const goalIds = Object.keys(ROUND_GOALS) as RoundGoalId[]
const all: CardKey[] = [
  ...LAW_DECK.map((id) => ({ kind: 'law' as const, id })),
  ...goalIds.map((id) => ({ kind: 'goal' as const, id })),
  ...PERSONAL_GOAL_DECK.map((id) => ({ kind: 'personal' as const, id })),
  ...EVENT_DECK.map((id) => ({ kind: 'event' as const, id })),
]
const W = 1800
const label = (t: string, sub: string) =>
  `<div style="display: flex; align-items: baseline; gap: 16px"><div style="font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 0.22em; color: #9b8cff">${t}</div><div style="font-size: 13px; color: #a49fc4">${sub}</div></div>`

const body = `<div style="width: ${W}px; box-sizing: border-box; padding: 56px; background: #14121f; color: #ece9ff; font-family: 'Noto Sans KR', system-ui, sans-serif; display: flex; flex-direction: column; gap: 40px">
<div style="display: flex; justify-content: space-between; align-items: flex-end">
<div style="display: flex; flex-direction: column; gap: 6px"><div style="font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 28px; letter-spacing: 0.2em">CARDS v2</div><div style="font-size: 14px; color: #a49fc4">각진 SF 프레임 · 종류 띠와 태그 · 성운 일러스트 창 · 육각 점수 배지. 일러스트는 카드 조건을 주사위 도해로 보여 줌 (앱 src/ui/cardArtData.ts와 같은 데이터)</div></div>
<div style="display: flex; gap: 16px; font-size: 13px; font-weight: 700"><span style="color: #9b8cff">◆ 우주 법칙</span><span style="color: #5ad1e6">◆ 라운드 목표</span><span style="color: #f2a65a">◆ 개인 목표</span><span style="color: #ff8a7a">◆ 사건</span></div>
</div>
${label('LARGE', '확대 보기 · 카드를 누르면 · 340px')}
<div style="display: flex; gap: 32px; align-items: flex-start">${large({ kind: 'law', id: 'mirror' })}${large({ kind: 'goal', id: 'skyscraper' })}${large({ kind: 'personal', id: 'timeLord' })}${back}</div>
${label('NORMAL', '가로 카드 · 카드 시트, 개인 목표 고르기 · 화면 너비')}
<div style="display: flex; gap: 32px; align-items: flex-start">${normal({ kind: 'law', id: 'void' })}${normal({ kind: 'goal', id: 'continent' })}${normal({ kind: 'personal', id: 'symmetry' })}</div>
${label('MINI', '세로 썸네일 · 라운드 시작 알림에서 나란히 · 132px')}
<div style="display: flex; gap: 20px; align-items: flex-start">${mini({ kind: 'law', id: 'shakyMarket' })}${mini({ kind: 'goal', id: 'rainbow' })}${mini({ kind: 'goal', id: 'cross' })}${mini({ kind: 'goal', id: 'pyramid' })}${mini({ kind: 'goal', id: 'colorRiver' })}${mini({ kind: 'event', id: 'timeRift' })}${mini({ kind: 'personal', id: 'redWorship' })}</div>
${label('ILLUSTRATIONS', `카드 ${all.length}장 전체 일러스트`)}
<div style="display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 16px">${all.map((c) => mini(c, 152)).join('')}</div>
</div>`

const rows = Math.ceil(all.length / 10)
const H = 56 + 60 + 40 + 30 + 486 + 40 + 30 + 190 + 40 + 30 + 200 + 40 + 30 + rows * 230 + 56
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>카드 v2</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&amp;family=Space+Grotesk:wght@500;700&amp;display=swap" rel="stylesheet">
<style>
body{margin:0;background:#14121f}
a{color:#b9adff}a:hover{color:#e8e4ff}
</style>
</helmet>
${body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${W},"height":${H}}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
`
writeFileSync(out, html)
console.log('written', out, W, H, html.length)
