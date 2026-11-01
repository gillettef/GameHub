// 홈 화면 히어로: 고리 행성이 지평선 위로 떠오르고, 착륙선이 내려앉으면 방사형 테크 웹이 땅에 그려진다.
// 정지 그림은 회화풍 WebP 3장(assets/landing/sky·planet·ground, scripts/art 로 구움), 움직이는 층은 이 인라인 SVG. 모션은 LandingHero.module.css
import type { CSSProperties } from 'react';
import sky from '../assets/landing/sky.webp';
import planet from '../assets/landing/planet.webp';
import ground from '../assets/landing/ground.webp';
import styles from './LandingHero.module.css';

type Vars = CSSProperties & Record<`--${string}`, string | number>;
const v = (o: Record<string, string | number>) => o as Vars;

// 세 노선 위성: 행성 고리 면을 따라 타원 공전(가로·세로 왕복을 반 박자 어긋나게 겹침)
const SATS = [
  { tone: 'ark', rx: 140, ry: 32, d: 7, o: 0, p: -0.8, q: 0.6 },
  { tone: 'symbiont', rx: 160, ry: 40, d: 9.5, o: -3, p: 0.4, q: -0.7 },
  { tone: 'synth', rx: 120, ry: 26, d: 6, o: -5, p: 0.9, q: 0.3 },
] as const;

// 착륙지(200,252)에서 퍼지는 테크 웹 — 고리 1·2·3과 바큇살, 고리 위 노드
const WEB_RINGS = [
  { ring: 1, d: 'M150 252A50 10 0 0 0 250 252', at: 0 },
  { ring: 2, d: 'M100 252A100 22 0 0 0 300 252', at: 200 },
  { ring: 3, d: 'M36 252A164 42 0 0 0 364 252', at: 400 },
] as const;
const SPOKES = 'M200 252L348.6 269.8M200 252L282 288.4M200 252L200 294M200 252L118 288.4M200 252L51.4 269.8';
const NODES = [
  [1, 175, 260.7], [1, 225, 260.7],
  [2, 109.4, 261.3], [2, 200, 274], [2, 290.6, 261.3],
  [3, 51.4, 269.8], [3, 118, 288.4], [3, 282, 288.4], [3, 348.6, 269.8],
] as const;

// 땅에서 피어올라 흘러가는 포자
const SPORES = [
  { x: 70, y: 300, r: 1.8, d: 9, o: 0, dx: 18, lime: false },
  { x: 140, y: 320, r: 1.4, d: 11, o: -4, dx: -14, lime: true },
  { x: 270, y: 310, r: 2, d: 10, o: -7, dx: 22, lime: false },
  { x: 340, y: 296, r: 1.5, d: 12, o: -2, dx: -20, lime: true },
] as const;

const stop = (color: string, opacity: number) => ({ stopColor: `var(${color})`, stopOpacity: opacity });

/** `quick` 이면 등장 시퀀스를 짧게 줄인다(두 번째 방문부터) */
export function LandingHero({ quick = false }: { quick?: boolean }) {
  return (
    <div className={styles.hero} style={v({ '--seq': quick ? 0.15 : 1 })} aria-hidden="true">
      <svg className={styles.svg} viewBox="0 0 400 360" preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="ntLandHalo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.5" style={stop('--ark', 0.42)} />
            <stop offset="0.75" style={stop('--ring2', 0.12)} />
            <stop offset="1" style={stop('--ark', 0)} />
          </radialGradient>
          <linearGradient id="ntLandMeteor" gradientUnits="userSpaceOnUse" x1="-48" y1="-16.6" x2="0" y2="0">
            <stop offset="0" style={stop('--text', 0)} />
            <stop offset="1" style={stop('--text', 1)} />
          </linearGradient>
          <radialGradient id="ntLandFogA" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" style={stop('--symbiont', 0.22)} />
            <stop offset="1" style={stop('--symbiont', 0)} />
          </radialGradient>
          <radialGradient id="ntLandFogB" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" style={stop('--ring2', 0.18)} />
            <stop offset="1" style={stop('--ring2', 0)} />
          </radialGradient>
          <radialGradient id="ntLandSite" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" style={stop('--accent', 0.6)} />
            <stop offset="1" style={stop('--accent', 0)} />
          </radialGradient>
          <clipPath id="ntLandGround">
            <path d="M0 262Q200 226 400 262V360H0Z" />
          </clipPath>
        </defs>

        {/* 노을 밤하늘(움직이지 않는 맨 아래 층) */}
        <image href={sky} width="400" height="360" preserveAspectRatio="none" />

        {/* 행성: 지평선 뒤에서 떠오름 */}
        <g className={styles.rise}>
          <circle className={styles.halo} cx="262" cy="118" r="120" fill="url(#ntLandHalo)" />
          <image href={planet} width="400" height="360" />
          <g transform="translate(262 118) rotate(-18)">
            {SATS.map((s) => (
              <g key={s.tone} className={styles.satX} style={v({ '--rx': `${s.rx}px`, '--d': `${s.d}s`, '--o': `${s.o}s`, '--p': s.p })}>
                <g className={`${styles.satY} ${styles[s.tone]}`} style={v({ '--ry': `${s.ry}px`, '--q': s.q })}>
                  <circle r="7" opacity="0.25" />
                  <rect className={styles.panel} x="-7" y="-0.8" width="14" height="1.6" />
                  <circle r="2.8" />
                </g>
              </g>
            ))}
          </g>
        </g>

        {/* 별똥별 */}
        <g transform="translate(60 30)">
          <g className={styles.meteor}>
            <line x1="-48" y1="-16.6" x2="0" y2="0" stroke="url(#ntLandMeteor)" strokeWidth="1.6" strokeLinecap="round" />
            <circle r="1.4" className={styles.star} />
          </g>
        </g>

        <image href={ground} width="400" height="360" />

        {/* 포자 안개 */}
        <g className={styles.fog}>
          <ellipse cx="110" cy="240" rx="150" ry="26" fill="url(#ntLandFogA)" />
          <ellipse cx="300" cy="252" rx="150" ry="22" fill="url(#ntLandFogB)" />
        </g>

        {/* 테크 웹: 착륙 뒤 땅 위에 그려짐 */}
        <g clipPath="url(#ntLandGround)" fill="none" strokeLinecap="round">
          <path className={`${styles.web} ${styles.spokes}`} style={v({ '--w': '300ms' })} pathLength={1} d={SPOKES} />
          {WEB_RINGS.map((w) => (
            <path
              key={w.ring}
              className={`${styles.web} ${styles[`ring${w.ring}`]}`}
              style={v({ '--w': `${w.at}ms` })}
              pathLength={1}
              d={w.d}
            />
          ))}
        </g>
        {NODES.map(([ring, cx, cy], i) => (
          <circle
            key={i}
            className={`${styles.node} ${styles[`dot${ring}`]}`}
            style={v({ '--w': `${700 + i * 60}ms` })}
            cx={cx}
            cy={cy}
            r={1.6 + ring * 0.4}
          />
        ))}

        {/* 착륙지 불빛·먼지, 착륙선 */}
        <ellipse className={styles.site} cx="200" cy="248" rx="64" ry="14" fill="url(#ntLandSite)" />
        <ellipse className={styles.dust} cx="200" cy="246" rx="34" ry="5" />
        <g transform="translate(200 245)">
          <g className={styles.lander}>
            <g className={styles.flame}>
              <path className={styles.flameOuter} d="M-4.5 -6L0 10L4.5 -6Z" />
              <path className={styles.flameCore} d="M-2 -6L0 3L2 -6Z" />
            </g>
            <path className={styles.legs} d="M-7 -8L-12 0M7 -8L12 0M-14 0H-10M10 0H14" />
            <path className={styles.hull} d="M-9 -7L-10.5 -18Q0 -34 10.5 -18L9 -7Z" />
            <path className={styles.seam} d="M-9 -7H9" />
            <circle className={styles.window} cy="-18" r="3.2" />
            <circle className={styles.beacon} cy="-30" r="1.8" />
          </g>
        </g>

        {SPORES.map((s, i) => (
          <circle
            key={i}
            className={`${styles.spore} ${s.lime ? styles.lime : ''}`}
            style={v({ '--d': `${s.d}s`, '--o': `${s.o}s`, '--dx': `${s.dx}px` })}
            cx={s.x}
            cy={s.y}
            r={s.r}
          />
        ))}
      </svg>
    </div>
  );
}
