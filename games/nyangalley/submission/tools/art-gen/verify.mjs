import { fileURLToPath } from 'node:url';
// art/spot-*.svg 의 배지(위치·숫자·노란 원)를 draw.mjs SPOTS 와 독립 계산으로 대조한다.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const SUB = fileURLToPath(new URL('../..', import.meta.url));
const { SPOTS, SPOT_IDS } = await import(pathToFileURL(`${SUB}/tools/draw.mjs`).href);
const DIRNAME = { '1,0': '동(오른쪽)', '1,-1': '북동(오른쪽 위)', '0,-1': '북서(왼쪽 위)', '-1,0': '서(왼쪽)', '-1,1': '남서(왼쪽 아래)', '0,1': '남동(오른쪽 아래)' };
let bad = 0;
const rows = [];
for (const id of SPOT_IDS) {
  const s = readFileSync(`${SUB}/art/spot-${id}.svg`, 'utf8');
  const got = [];
  for (const m of s.matchAll(/<g data-badge="side" data-dq="(-?\d)" data-dr="(-?\d)" data-n="(\d)" data-far="(\w+)"><circle [^>]*opacity="0.25"\/><circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)" fill="(#\w+)".*?>([^<]+)<\/text><\/g>/g)) {
    const [, dq, dr, n, far, cx, cy, , fill, label] = m;
    got.push({ dq: +dq, dr: +dr, n: +n, far: far === 'true', cx: +cx, cy: +cy, fill, label });
  }
  const center = +(s.match(/data-badge="center" data-n="(\d)"/) || [])[1];
  const centerText = (s.match(/data-badge="center"[^]*?<text[^>]*>(\d)<\/text>/) || [])[1];
  const exp = SPOTS[id].roots;
  const expCenter = exp.find(([q, r]) => q === 0 && r === 0)[2];
  const sides = exp.filter(([q, r]) => q || r);
  const errs = [];
  if (center !== expCenter || +centerText !== expCenter) errs.push(`가운데 ${centerText}≠${expCenter}`);
  if (got.length !== sides.length) errs.push(`배지 수 ${got.length}≠${sides.length}`);
  const desc = [];
  for (const [dq, dr, n] of sides) {
    const g = got.find((b) => b.dq === dq && b.dr === dr);
    const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    const ux = Math.sqrt(3) * (dq / dist + dr / dist / 2);
    const uy = 1.5 * (dr / dist);
    const L = Math.hypot(ux, uy);
    // 같은 방향에 옆 칸·두 칸 앞이 함께 있으면 안 40 / 밖 70, 아니면 draw.mjs 그대로 66
    const sameDir = sides.some(([q2, r2]) => {
      const k = Math.max(Math.abs(q2), Math.abs(r2), Math.abs(q2 + r2));
      return k !== dist && q2 / k === dq / dist && r2 / k === dr / dist;
    });
    const D = sameDir ? (dist === 2 ? 70 : 34) : 66;
    if (sameDir && dist === 2 && !s.includes(`data-arrow="${dq},${dr}"`)) errs.push(`(${dq},${dr}) 화살표 없음`);
    const ex = (ux / L) * D;
    const ey = (uy / L) * D;
    const far = dist === 2;
    const label = far ? `»${n}` : `${n}`;
    if (!g) { errs.push(`(${dq},${dr}) 없음`); continue; }
    if (Math.abs(g.cx - ex) > 0.02 || Math.abs(g.cy - ey) > 0.02) errs.push(`(${dq},${dr}) 위치 ${g.cx},${g.cy}≠${ex.toFixed(2)},${ey.toFixed(2)}`);
    if (g.label !== label) errs.push(`(${dq},${dr}) 글자 ${g.label}≠${label}`);
    if (g.fill !== (far ? '#ffe066' : '#ffffff')) errs.push(`(${dq},${dr}) 색 ${g.fill}`);
    const dirKey = `${dq / dist},${dr / dist}`;
    desc.push(`${DIRNAME[dirKey]} ${label} @(${g.cx},${g.cy})`);
  }
  bad += errs.length;
  rows.push(`| ${SPOTS[id].name} (${id}) | ${center} | ${desc.join(' · ') || '없음'} | ${errs.length ? errs.join('; ') : 'OK'} |`);
}
console.log('| 명당 | 가운데 | 옆·두 칸 앞 배지 (방향, 표시, 좌표) | 대조 |\n|---|---|---|---|\n' + rows.join('\n'));
console.log(bad ? `불일치 ${bad}건` : '9종 모두 일치');
process.exit(bad ? 1 : 0);
