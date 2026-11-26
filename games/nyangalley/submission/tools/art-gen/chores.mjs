import { fileURLToPath, pathToFileURL } from 'node:url';
// 「냥냥 골목」 골목 일과 타일 6장 + 뒷면 생성기(디자인 에이전트가 작성).
//   node chores.mjs                → ../../art/chore-*.svg 와 ../../../public/art/chore-*.svg
//   node chores.mjs <캔버스 폴더>   → 위 + <캔버스 폴더>/project/Chores.dc.html (Design 캔버스 아트보드)
// 고양이 그림 조각(catHead·sittingCat·loafCat)과 명당 그림(ILL)은 art.mjs 의 원본을 그대로 읽어 쓴다
// (art.mjs 는 불러오기만 해도 모든 그림을 다시 쓰므로 import 하지 않고, 그 구간 소스를 잘라 실행한다).
// 문구는 notes/Rules.md 5.3 "일과 6장" 표를 줄인 것이다.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const SUB = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${SUB}/art`;
const PUB = fileURLToPath(new URL('../../../public/art', import.meta.url));
const { SEAT, SEAT_DARK, SPOTS } = await import(pathToFileURL(`${SUB}/tools/draw.mjs`).href);

const FONT = `Pretendard, 'Malgun Gothic', sans-serif`;
const INK = '#3b2a1c';
const f = (n) => (Math.round(n * 100) / 100).toString();
const T = (x, y, size, s, { fill = INK, weight = 800, anchor = 'middle', extra = '' } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" text-anchor="${anchor}" font-weight="${weight}" fill="${fill}" font-family="${FONT}"${extra}>${s}</text>`;
const hexPts = (cx, cy, R, rot = -30) => {
  const p = [];
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k + rot) * Math.PI) / 180;
    p.push(`${f(cx + R * Math.cos(a))},${f(cy + R * Math.sin(a))}`);
  }
  return p.join(' ');
};
const svg = (vb, inner, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}" font-family="${FONT}">\n<title>${title}</title>\n${inner}\n</svg>\n`;

// --- art.mjs 의 그림 조각 ---------------------------------------------------
const artSrc = readFileSync(new URL('./art.mjs', import.meta.url), 'utf8');
const from = artSrc.indexOf('const CAT = [');
const to = artSrc.indexOf('// 묶음 아이콘');
if (from < 0 || to < 0) throw new Error('art.mjs 에서 그림 조각 구간을 찾지 못했습니다');
const { catHead, sittingCat, loafCat, ILL } = new Function('f', 'INK', 'SEAT', 'SEAT_DARK', `${artSrc.slice(from, to)}\nreturn { catHead, sittingCat, loafCat, ILL };`)(f, INK, SEAT, SEAT_DARK);

// 발자국(art.mjs 와 같은 모양)
const paw = (x, y, s, a = 0, fill = INK, op = 1) =>
  `<g transform="translate(${f(x)},${f(y)}) rotate(${f(a)}) scale(${f(s)})" fill="${fill}" opacity="${op}"><ellipse cx="0" cy="2" rx="4" ry="3.4"/><circle cx="-4" cy="-3" r="1.6"/><circle cx="0" cy="-4.6" r="1.6"/><circle cx="4" cy="-3" r="1.6"/></g>`;
// 작은 명당 타일(육각, 명당 그림 축소)
const miniSpot = (id, x, y, R) =>
  `<polygon points="${hexPts(x, y, R)}" fill="${SPOTS[id].bg}" stroke="${INK}" stroke-width="${f(R * 0.06)}" stroke-linejoin="round"/><polygon points="${hexPts(x, y, R * 0.88)}" fill="none" stroke="#fffaf0" stroke-width="${f(R * 0.03)}" stroke-dasharray="${f(R * 0.07)} ${f(R * 0.05)}"/><g transform="translate(${f(x)},${f(y - R * 0.08)}) scale(${f(R / 100)})">${ILL[id]()}</g>`;
const spotBackMini = (x, y, R) =>
  `<polygon points="${hexPts(x, y, R)}" fill="#9a6a43" stroke="${INK}" stroke-width="${f(R * 0.06)}" stroke-linejoin="round"/><polygon points="${hexPts(x, y, R * 0.86)}" fill="none" stroke="#f6dfc0" stroke-width="${f(R * 0.03)}" stroke-dasharray="${f(R * 0.07)} ${f(R * 0.05)}"/>${paw(x, y + R * 0.05, R * 0.06, 0, '#f6dfc0', 0.9)}`;
// 냄새 물결
const scent = (x, y, len, color = '#8a6a50') =>
  `<path d="M${f(x)},${f(y)} q${f(len / 6)},${f(-len / 7)} ${f(len / 3)},0 t${f(len / 3)},0 t${f(len / 3)},0" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
// 생선(낚시꾼 그림의 물고기를 키운 것)
const fish = (x, y, s, flip = false) =>
  `<g transform="translate(${f(x)},${f(y)}) scale(${flip ? -s : s},${s})"><path d="M-22,0 C-14,-12 6,-12 12,0 C6,12 -14,12 -22,0 Z" fill="#5b8fc7" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M12,0 L22,-8 L21,8 Z" fill="#5b8fc7" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="-14" cy="-2" r="2" fill="#fff" stroke="${INK}" stroke-width="1"/><path d="M-6,-6 q2.5,6 0,12 M0,-6 q2.5,6 0,12" stroke="#2c5a8a" stroke-width="1.3" fill="none"/></g>`;

// --- 그림 (지역 좌표: 그림 영역 가운데가 0,0, 대략 x ±260 · y ±90) ---------------
const ART = {
  // 식빵 굽기: 방석 위 식빵 자세 고양이 + "+1" 얼굴 배지
  bread: () => {
    const o = [];
    o.push(`<ellipse cx="-20" cy="78" rx="150" ry="10" fill="#3a2a17" opacity="0.16"/>`);
    o.push(`<rect x="-150" y="44" width="260" height="34" rx="17" fill="#e9787a" stroke="${INK}" stroke-width="5"/>`);
    o.push(`<path d="M-120,61 H80" stroke="#c95a5e" stroke-width="3" stroke-dasharray="10 9" stroke-linecap="round"/>`);
    o.push(loafCat(0, 92, { x: -20, y: 52 }));
    // 김(따끈따끈)
    o.push(`<path d="M-64,-72 q-10,-12 0,-24 q10,-12 0,-24 M-34,-62 q-10,-12 0,-24 q10,-12 0,-24" stroke="#d9a878" stroke-width="5" fill="none" stroke-linecap="round"/>`);
    // +1 배지 (명당 타일 가운데 배지와 같은 귀 달린 원)
    const bx = 178, by = 6, cr = 46;
    o.push(`<g><path d="M${f(bx - cr * 0.92)},${f(by - cr * 0.4)} L${f(bx - cr * 0.78)},${f(by - cr * 1.32)} L${f(bx - cr * 0.2)},${f(by - cr * 0.92)} Z M${f(bx + cr * 0.92)},${f(by - cr * 0.4)} L${f(bx + cr * 0.78)},${f(by - cr * 1.32)} L${f(bx + cr * 0.2)},${f(by - cr * 0.92)} Z" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M${f(bx - cr * 0.7)},${f(by - cr * 0.62)} L${f(bx - cr * 0.68)},${f(by - cr * 1.05)} L${f(bx - cr * 0.36)},${f(by - cr * 0.84)} Z M${f(bx + cr * 0.7)},${f(by - cr * 0.62)} L${f(bx + cr * 0.68)},${f(by - cr * 1.05)} L${f(bx + cr * 0.36)},${f(by - cr * 0.84)} Z" fill="#f4a7a3"/><circle cx="${bx}" cy="${by}" r="${cr}" fill="${INK}" stroke="#fffaf0" stroke-width="3"/>${T(bx, by + 18, 50, '+1', { fill: '#fff', weight: 900 })}</g>`);
    return o.join('');
  },
  // 생선 냄새: 코를 킁킁하는 고등어냥 + 생선 냄새 + 펼친 타일 3개
  peek: () => {
    const o = [];
    o.push(catHead(2, 66, { x: -168, y: 14, look: 1 }));
    // 킁킁 표시
    o.push(`<path d="M-104,-42 l14,-12 M-96,-24 l20,-4" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`);
    o.push(scent(-88, 6, 66), scent(-80, 30, 54));
    // 펼친 타일 3개(가운데 = 주머니에서 편 1개)
    o.push(miniSpot('oak', -2, 18, 44));
    o.push(miniSpot('grass', 92, 18, 44));
    o.push(spotBackMini(186, 18, 44));
    o.push(`<path d="M150,-34 q36,-26 72,0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="2 9"/>`);
    o.push(fish(198, -54, 1.5, true));
    return o.join('');
  },
  // 마실: 발자국을 남기며 어슬렁 걷는 치즈냥 + 두 칸
  roam: () => {
    const o = [];
    // 육각 세 칸(내 칸 → 한 칸 → 두 칸)
    const cells = [[-170, 50], [-62, 50], [46, 50]];
    cells.forEach(([x, y], i) => {
      o.push(`<polygon points="${hexPts(x, y, 46, 0)}" fill="${i === 0 ? '#ffd9a8' : '#efe6d6'}" stroke="${i === 2 ? '#c0692f' : '#a89878'}" stroke-width="${i === 2 ? 5 : 3}" stroke-linejoin="round" ${i === 2 ? 'stroke-dasharray="12 8"' : ''}/>`);
    });
    o.push(catHead(0, 26, { x: -170, y: 54 }));
    o.push(T(-62, 64, 30, '1', { fill: '#a89878', weight: 900 }));
    o.push(T(46, 64, 30, '2', { fill: '#c0692f', weight: 900 }));
    // 발자국 길
    [[-128, 8, 70], [-102, -6, 80], [-76, 6, 90], [-50, -8, 96], [-22, 6, 100], [4, -6, 104]].forEach(([x, y, a]) => o.push(paw(x, y - 30, 2.2, a, '#c9b99f')));
    // 걷는 고양이(옆모습): 꼬리 · 다리 · 몸 · 머리
    const cx = 168, cy = 52;
    const c = { base: SEAT[0], dark: SEAT_DARK[0] };
    o.push(`<ellipse cx="${cx}" cy="${cy + 26}" rx="78" ry="8" fill="#3a2a17" opacity="0.16"/>`);
    o.push(`<path d="M${cx + 52},${cy - 30} C${cx + 92},${cy - 40} ${cx + 92},${cy - 96} ${cx + 70},${cy - 108}" stroke="${INK}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="M${cx + 52},${cy - 30} C${cx + 92},${cy - 40} ${cx + 92},${cy - 96} ${cx + 70},${cy - 108}" stroke="${c.base}" stroke-width="11" fill="none" stroke-linecap="round"/>`);
    for (const [lx, sw] of [[-36, -6], [-14, 8], [26, -8], [46, 6]])
      o.push(`<path d="M${cx + lx},${cy - 10} L${cx + lx + sw},${cy + 22}" stroke="${INK}" stroke-width="17" stroke-linecap="round"/><path d="M${cx + lx},${cy - 10} L${cx + lx + sw},${cy + 22}" stroke="${c.base}" stroke-width="9" stroke-linecap="round"/>`);
    o.push(`<path d="M${cx - 58},${cy - 22} C${cx - 60},${cy - 54} ${cx - 20},${cy - 58} ${cx + 10},${cy - 56} C${cx + 44},${cy - 56} ${cx + 66},${cy - 48} ${cx + 62},${cy - 20} C${cx + 58},${cy} ${cx - 54},${cy + 2} ${cx - 58},${cy - 22} Z" fill="${c.base}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`);
    o.push(`<path d="M${cx - 6},${cy - 54} q4,14 0,26 M${cx + 16},${cy - 55} q4,14 0,26 M${cx + 38},${cy - 52} q4,14 0,24" stroke="${c.dark}" stroke-width="6" stroke-linecap="round" fill="none"/>`);
    o.push(catHead(0, 36, { x: cx - 64, y: cy - 60, look: -1 }));
    return o.join('');
  },
  // 대장 방울: 빨간 목줄에 금방울 단 치즈냥 대장
  boss: () => {
    const o = [];
    const s = 50;
    const x = 0, y = 86;
    o.push(`<ellipse cx="0" cy="${y + 2}" rx="170" ry="9" fill="#3a2a17" opacity="0.12"/>`);
    // 받침 상자(대장 자리)
    o.push(`<rect x="-92" y="${y - 22}" width="184" height="26" rx="5" fill="#e2b783" stroke="${INK}" stroke-width="4"/>`);
    o.push(sittingCat(0, s, { x, y: y - 22, look: 0 }));
    // 목줄 + 방울
    const ny = y - 22 - 1.12 * s;
    o.push(`<path d="M${f(-0.46 * s)},${f(ny - 4)} Q0,${f(ny + 14)} ${f(0.46 * s)},${f(ny - 4)}" stroke="${INK}" stroke-width="13" fill="none" stroke-linecap="round"/><path d="M${f(-0.46 * s)},${f(ny - 4)} Q0,${f(ny + 14)} ${f(0.46 * s)},${f(ny - 4)}" stroke="#d8443f" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    o.push(`<g transform="translate(0,${f(ny + 18)})"><circle r="13" fill="#ffd34d" stroke="${INK}" stroke-width="3.4"/><path d="M-12,-2 H12" stroke="${INK}" stroke-width="2.4"/><circle cx="0" cy="5" r="2.6" fill="${INK}"/><path d="M0,5 V12" stroke="${INK}" stroke-width="2"/><circle cx="-4" cy="-6" r="2.4" fill="#fff" opacity="0.9"/></g>`);
    // 딸랑 표시
    o.push(`<path d="M34,${f(ny + 6)} l22,-6 M36,${f(ny + 22)} l22,4 M-34,${f(ny + 6)} l-22,-6 M-36,${f(ny + 22)} l-22,4" stroke="#e0a92a" stroke-width="5" stroke-linecap="round"/>`);
    // 다음 라운드 선 표시: 맨 앞 깃발
    o.push(`<g transform="translate(176,${y - 10})"><path d="M0,0 V-132" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M3,-130 H74 L58,-108 L74,-86 H3 Z" fill="#d8443f" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>${T(34, -98, 28, '선', { fill: '#fff', weight: 900 })}</g>`);
    // 뒤를 따르는 작은 고양이들
    o.push(sittingCat(2, 22, { x: -170, y: y - 4, look: 1 }));
    o.push(sittingCat(1, 22, { x: -232, y: y - 4, look: 1 }));
    return o.join('');
  },
  // 담 넘기: 벽돌담을 훌쩍 넘는 턱시도냥(두 번까지)
  move: () => {
    const o = [];
    // 담
    o.push(`<ellipse cx="0" cy="92" rx="200" ry="8" fill="#3a2a17" opacity="0.14"/>`);
    o.push(`<rect x="-60" y="30" width="120" height="60" rx="3" fill="#efe4d6" stroke="${INK}" stroke-width="5"/>`);
    o.push(`<path d="M-60,50 H60 M-60,70 H60 M-30,30 V50 M10,30 V50 M44,30 V50 M-46,50 V70 M-8,50 V70 M30,50 V70 M-30,70 V90 M10,70 V90 M44,70 V90" stroke="#cbb9a2" stroke-width="3"/>`);
    o.push(`<rect x="-70" y="20" width="140" height="14" rx="4" fill="#bfa98d" stroke="${INK}" stroke-width="5"/>`);
    // 점프 궤적(두 번)
    o.push(`<path d="M-220,80 Q-160,-30 -96,40" stroke="#8a6a50" stroke-width="4" fill="none" stroke-dasharray="3 10" stroke-linecap="round"/><path d="M-96,40 L-104,26 M-96,40 L-112,40" stroke="#8a6a50" stroke-width="4" stroke-linecap="round"/>`);
    o.push(`<path d="M96,40 Q170,-40 230,80" stroke="#8a6a50" stroke-width="4" fill="none" stroke-dasharray="3 10" stroke-linecap="round"/><path d="M230,80 L218,70 M230,80 L230,64" stroke="#8a6a50" stroke-width="4" stroke-linecap="round"/>`);
    // 뛰어오른 고양이(앞으로 쭉 뻗은 자세), 담 위
    const cx = 0, cy = -22;
    const base = SEAT[1];
    o.push(`<g transform="rotate(-8 ${cx} ${cy})">`);
    o.push(`<path d="M${cx - 64},${cy + 6} C${cx - 104},${cy + 4} ${cx - 120},${cy + 28} ${cx - 140},${cy + 18}" stroke="${INK}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="M${cx - 64},${cy + 6} C${cx - 104},${cy + 4} ${cx - 120},${cy + 28} ${cx - 140},${cy + 18}" stroke="${base}" stroke-width="11" fill="none" stroke-linecap="round"/>`);
    // 뒷다리(뒤로) · 앞다리(앞으로)
    o.push(`<path d="M${cx - 50},${cy + 14} L${cx - 92},${cy + 40} M${cx - 36},${cy + 18} L${cx - 70},${cy + 48}" stroke="${INK}" stroke-width="17" stroke-linecap="round"/><path d="M${cx - 50},${cy + 14} L${cx - 92},${cy + 40} M${cx - 36},${cy + 18} L${cx - 70},${cy + 48}" stroke="#fff" stroke-width="9" stroke-linecap="round"/>`);
    o.push(`<path d="M${cx + 46},${cy + 10} L${cx + 84},${cy + 24} M${cx + 36},${cy + 16} L${cx + 74},${cy + 36}" stroke="${INK}" stroke-width="17" stroke-linecap="round"/><path d="M${cx + 46},${cy + 10} L${cx + 84},${cy + 24} M${cx + 36},${cy + 16} L${cx + 74},${cy + 36}" stroke="#fff" stroke-width="9" stroke-linecap="round"/>`);
    o.push(`<path d="M${cx - 70},${cy + 4} C${cx - 72},${cy - 24} ${cx - 30},${cy - 30} ${cx},${cy - 28} C${cx + 40},${cy - 26} ${cx + 66},${cy - 18} ${cx + 62},${cy + 6} C${cx + 58},${cy + 26} ${cx - 66},${cy + 28} ${cx - 70},${cy + 4} Z" fill="${base}" stroke="#111114" stroke-width="5" stroke-linejoin="round"/>`);
    o.push(`<path d="M${cx - 30},${cy + 20} C${cx - 10},${cy + 6} ${cx + 30},${cy + 6} ${cx + 50},${cy + 16} C${cx + 30},${cy + 26} ${cx - 10},${cy + 28} ${cx - 30},${cy + 20} Z" fill="#fff"/>`);
    o.push(`</g>`);
    o.push(catHead(1, 36, { x: cx + 88, y: cy - 30, look: 1 }));
    // 바람 선
    o.push(`<path d="M-150,-92 h40 M-170,-70 h46 M-148,-48 h30" stroke="${INK}" stroke-width="4" stroke-linecap="round" opacity="0.45"/>`);
    // 두 번까지
    o.push(`<g transform="translate(206,-58)"><circle r="34" fill="#fffaf0" stroke="${INK}" stroke-width="4"/>${T(0, 12, 34, '×2', { weight: 900 })}</g>`);
    return o.join('');
  },
  // 명당 부르기: 야옹 부르는 턱시도냥 + 다시 돌려 놓는 명당 타일
  call: () => {
    const o = [];
    o.push(`<ellipse cx="-150" cy="88" rx="70" ry="8" fill="#3a2a17" opacity="0.16"/>`);
    o.push(sittingCat(1, 44, { x: -160, y: 86, look: 1 }));
    // 말풍선
    o.push(`<g transform="translate(-40,-24)"><path d="M-66,-30 C-66,-52 -40,-60 0,-60 C40,-60 66,-52 66,-30 C66,-8 40,0 0,0 L-30,0 L-50,18 L-44,-2 C-58,-6 -66,-16 -66,-30 Z" fill="#fffaf0" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>${T(0, -18, 32, '야옹!', { weight: 900 })}</g>`);
    // 명당 타일 + 회전 화살표
    o.push(miniSpot('oak', 140, 16, 74));
    o.push(`<path d="M${f(140 - 92)},${f(16 - 42)} A100,100 0 0 1 ${f(140 + 40)},${f(16 - 92)}" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M${f(140 + 40)},${f(16 - 92)} l-18,-12 M${f(140 + 40)},${f(16 - 92)} l-10,18" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`);
    // 그 칸 +1
    o.push(`<g transform="translate(238,-46)"><circle r="30" fill="${INK}" stroke="#fffaf0" stroke-width="3"/>${T(0, 12, 32, '+1', { fill: '#fff', weight: 900 })}</g>`);
    // 소리 선
    o.push(`<path d="M-96,-6 l18,-6 M-100,14 l20,2" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`);
    return o.join('');
  },
};

// --- 타일 ------------------------------------------------------------------
const PLACE = { band: '#e07b39', dark: '#9a4a1a', label: '놓기' };
const NOPLACE = { band: '#6f8496', dark: '#3f5163', label: '놓지 않음' };
const CHORES = [
  { id: 'bread', name: '식빵 굽기', place: true, lines: ['명당 놓기', '+ 놓은 칸 고양이 +1'] },
  { id: 'peek', name: '생선 냄새', place: true, lines: ['주머니 맨 위 1개를 펴고,', '펼친 타일 포함 3개 중 1개로 명당 놓기'] },
  { id: 'roam', name: '마실', place: true, lines: ['내 칸에서 두 칸 안의', '빈 칸에도 명당 놓기'] },
  { id: 'boss', name: '대장 방울', place: true, lines: ['명당 놓기', '+ 다음 라운드 선'] },
  { id: 'move', name: '담 넘기', place: false, lines: ['명당 대신: 고양이 1~2마리를', '옆 칸으로, 두 번까지'] },
  { id: 'call', name: '명당 부르기', place: false, lines: ['명당 대신: 내 명당 하나를 돌려 다시 부르기', '(그 칸 +1) + 펼친 타일 1개 가져오기'] },
];

/** 띠 오른쪽 표시: 놓기 = 명당(육각) + 글자, 놓지 않음 = 빗금 친 육각 + 글자 */
function placeMark(k, place) {
  const w = place ? 132 : 196;
  const x0 = 596 - w;
  const hx = x0 + 32;
  const o = [`<rect x="${x0}" y="26" width="${w}" height="46" rx="23" fill="#fffaf0" stroke="${INK}" stroke-width="3.5"/>`];
  if (place) o.push(`<polygon points="${hexPts(hx, 49, 15)}" fill="${k.band}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`);
  else o.push(`<polygon points="${hexPts(hx, 49, 15)}" fill="none" stroke="${k.dark}" stroke-width="3" stroke-linejoin="round" stroke-dasharray="5 3.4"/><path d="M${hx - 13},${49 + 13} L${hx + 13},${49 - 13}" stroke="${k.dark}" stroke-width="4" stroke-linecap="round"/>`);
  o.push(T(hx + 22, 60, 28, k.label, { fill: k.dark, weight: 900, anchor: 'start' }));
  return `<g data-mark="${place ? 'place' : 'noplace'}">${o.join('')}</g>`;
}

function choreSvg(c) {
  const k = c.place ? PLACE : NOPLACE;
  const p = `chore-${c.id}`;
  const o = [];
  o.push(`<defs><clipPath id="${p}-clip"><rect x="8" y="8" width="614" height="424" rx="30"/></clipPath><clipPath id="${p}-art"><rect x="16" y="106" width="598" height="200"/></clipPath></defs>`);
  o.push(`<rect x="4" y="4" width="622" height="432" rx="34" fill="#fffaf0" stroke="${INK}" stroke-width="8"/>`);
  o.push(`<g clip-path="url(#${p}-clip)">`);
  o.push(`<rect x="0" y="0" width="630" height="90" fill="${k.band}"/>`);
  o.push(`<path d="M0,90 Q80,104 160,90 T320,90 T480,90 T640,90 V0 H0 Z" fill="${k.band}"/>`);
  o.push(`<path d="M0,90 Q80,104 160,90 T320,90 T480,90 T640,90" fill="none" stroke="${k.dark}" stroke-width="5"/>`);
  o.push(paw(250, 30, 2, -15, '#ffffff', 0.14), paw(300, 70, 1.6, 10, '#ffffff', 0.14));
  // 바닥 발자국(연하게)
  o.push(`<g opacity="0.5">${[[48, 270, -20], [584, 140, 15], [560, 280, 30], [70, 140, -5]].map(([x, y, a]) => paw(x, y, 2, a, '#ead9bf', 1)).join('')}</g>`);
  o.push(`</g>`);
  o.push(T(40, 66, 50, c.name, { fill: '#ffffff', weight: 900, anchor: 'start', extra: ` stroke="${k.dark}" stroke-width="3" paint-order="stroke" data-label="name"` }));
  o.push(placeMark(k, c.place));
  o.push(`<g data-art="1" clip-path="url(#${p}-art)"><g transform="translate(315,208)">${ART[c.id]()}</g></g>`);
  // 효과
  const n = c.lines.length;
  const longest = Math.max(...c.lines.map((s) => s.length));
  const size = longest > 20 ? 27 : longest > 15 ? 30 : 34;
  o.push(`<rect x="28" y="312" width="574" height="106" rx="22" fill="#f6ead6"/>`);
  const mid = 365;
  const lh = size * 1.32;
  c.lines.forEach((ln, i) => {
    const y = mid + (i - (n - 1) / 2) * lh + size * 0.36;
    const html = ln.replace(/^명당 대신:/, `<tspan fill="${k.dark}" font-weight="900">명당 대신:</tspan>`);
    o.push(T(315, y, size, html, { weight: 700, extra: ' data-label="rule"' }));
  });
  return svg('0 0 630 440', o.join('\n'), `골목 일과 — ${c.name} (${k.label}): ${c.lines.join(' ')}`);
}

function choreBackSvg() {
  const o = [];
  o.push(`<defs><clipPath id="chore-back-clip"><rect x="8" y="8" width="614" height="424" rx="30"/></clipPath></defs>`);
  o.push(`<rect x="4" y="4" width="622" height="432" rx="34" fill="#4c5f70" stroke="${INK}" stroke-width="8"/>`);
  const paws = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 7; c++) {
      const x = 40 + c * 96 + (r % 2) * 48;
      const y = 44 + r * 92;
      paws.push(paw(x, y, 2.4, ((r * 7 + c * 13) % 5) * 9 - 18, '#f6dfc0', 1));
    }
  o.push(`<g clip-path="url(#chore-back-clip)" opacity="0.12">${paws.join('')}</g>`);
  o.push(`<rect x="30" y="30" width="570" height="380" rx="22" fill="none" stroke="#f6dfc0" stroke-width="4" stroke-dasharray="16 10"/>`);
  // 해와 달(하루 일과) 반원 + 가운데 고양이
  o.push(`<g transform="translate(315,226)">`);
  o.push(`<path d="M-150,0 A150,150 0 0 1 150,0" fill="none" stroke="#f6dfc0" stroke-width="5" stroke-dasharray="4 12" stroke-linecap="round"/>`);
  o.push(`<g transform="translate(-150,0)"><circle r="24" fill="#ffd34d" stroke="${INK}" stroke-width="4"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i * Math.PI) / 4; return `<path d="M${f(Math.cos(a) * 31)},${f(Math.sin(a) * 31)} L${f(Math.cos(a) * 40)},${f(Math.sin(a) * 40)}" stroke="#ffd34d" stroke-width="5" stroke-linecap="round"/>`; }).join('')}</g>`);
  o.push(`<g transform="translate(150,0)"><circle r="24" fill="#f6dfc0" stroke="${INK}" stroke-width="4"/><circle cx="11" cy="-8" r="19" fill="#4c5f70"/><circle cx="-8" cy="6" r="3" fill="#e2c9a4"/><circle cx="-12" cy="-6" r="2" fill="#e2c9a4"/></g>`);
  o.push(`<circle cx="0" cy="-30" r="84" fill="#f6dfc0" stroke="${INK}" stroke-width="5"/>`);
  o.push(`<circle cx="0" cy="-30" r="74" fill="none" stroke="#4c5f70" stroke-width="2" stroke-dasharray="4 4"/>`);
  o.push(catHead(0, 50, { x: 0, y: -20, look: 0 }));
  o.push(`</g>`);
  o.push(T(315, 348, 60, '골목 일과', { fill: '#f6dfc0', weight: 900, extra: ` stroke="${INK}" stroke-width="4" paint-order="stroke"` }));
  o.push(T(315, 390, 22, '냥냥 골목', { fill: '#c5d6e6', weight: 800, extra: ' letter-spacing="3"' }));
  return svg('0 0 630 440', o.join('\n'), '골목 일과 타일 뒷면');
}

// --- 저장 --------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
mkdirSync(PUB, { recursive: true });
const names = [];
const save = (name, content) => {
  writeFileSync(`${OUT}/${name}`, content);
  copyFileSync(`${OUT}/${name}`, `${PUB}/${name}`);
  names.push(name);
};
for (const c of CHORES) save(`chore-${c.id}.svg`, choreSvg(c));
save('chore-back.svg', choreBackSvg());
console.log(names.length, 'files:', names.join(' '));

// --- Design 캔버스 아트보드 (canvas.mjs 와 같은 틀) ---------------------------------
const canvasRoot = process.argv[2];
if (canvasRoot) {
  const inline = (name, w) => {
    let s = readFileSync(`${OUT}/${name}.svg`, 'utf8');
    s = s.replace(/<title>.*?<\/title>\n?/, '');
    s = s.replace(/font-family="Pretendard, 'Malgun Gothic', sans-serif"/g, `font-family="Pretendard, 'Malgun Gothic', 'Noto Sans KR', sans-serif"`);
    s = s.replace(/<([a-zA-Z]+)([^<>]*?)\/>/g, '<$1$2></$1>');
    s = s.replace('<svg ', `<svg width="${w}" style="display: block; width: ${w}px; height: auto" `);
    return s.trim();
  };
  const cell = (name, label, w) =>
    `<figure style="margin: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; width: ${w}px">${inline(name, w)}<figcaption style="display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center"><span style="font-size: 15px; font-weight: 700; color: #3b2a1c">${label}</span><span style="font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; color: #7a6650">art/${name}.svg</span></figcaption></figure>`;
  const W = 1680;
  const H = 880;
  const CW = 378; // 63 × 44mm, 1mm = 6px
  const items = CHORES.map((c) => cell(`chore-${c.id}`, `${c.name} · ${c.place ? '놓기' : '놓지 않음'}`, CW));
  items.push(cell('chore-back', '뒷면 (모두 같음)', CW));
  const body = `<header style="display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap"><h1 style="margin: 0; font-size: 34px; font-weight: 900">골목 일과 타일 6장 + 뒷면</h1><p style="margin: 0; font-size: 16px; color: #7a6650">63 × 44mm · 1mm = 6px · 주황 띠 = 명당을 놓는 일과 4장, 청회색 띠 = 놓지 않는 일과 2장</p></header>
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; justify-items: center">${items.join('')}</div>`;
  const page = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>골목 일과 타일</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&amp;family=JetBrains+Mono:wght@400&amp;display=swap">
<style>
body{margin:0}
a{color:#8a4a1e}a:hover{color:#5b3a29}
</style>
</helmet>
<div style="width: ${W}px; height: ${H}px; box-sizing: border-box; padding: 48px; background: #fbf3e4; font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; color: #3b2a1c; display: flex; flex-direction: column; gap: 28px">
${body}
</div>
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
`;
  mkdirSync(`${canvasRoot}/project`, { recursive: true });
  writeFileSync(`${canvasRoot}/project/Chores.dc.html`, page);
  console.log('canvas:', `${canvasRoot}/project/Chores.dc.html`, page.length);
}
