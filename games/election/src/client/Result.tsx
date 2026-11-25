// 개표 결과(옛 화면의 결과 시트 내용): 당선 도장, 후보별 표, 선거인단 바, 권역별 결과
import { CAP, HOLE_COUNT, HOLE_LABELS, HOLE_NAMES, PLAYER_NAMES } from '../engine/constants'
import { countColor, holeOwner, score, winner } from '../engine/rules'
import type { GameState, Player } from '../engine/types'
import { Mark } from './icons'
import { TOTAL_SEATS } from './text'

export function TugBar({ s, large = false }: { s: GameState; large?: boolean }) {
  const t = score(s)
  return (
    <div className={`el-tug-bar${large ? ' lg' : ''}`} aria-hidden="true">
      {Array.from({ length: TOTAL_SEATS }, (_, k) => (
        <span key={k} className={k < t[0] ? 'el-seg s0' : k >= TOTAL_SEATS - t[1] ? 'el-seg s1' : 'el-seg'} />
      ))}
      <span className="el-tug-mid" />
    </div>
  )
}

export interface ResultProps {
  s: GameState
  /** 후보 색별 이름 */
  names: [string, string]
  /** 내 후보 색(관전·한 기기 두 사람이면 null) */
  mine: Player | null
}

export function Result({ s, names, mine }: ResultProps) {
  const t = score(s)
  const w = winner(s)
  const kicker = w === null || mine === null ? '선거일 · 개표 완료' : w === mine ? '선거일 · 승리' : '선거일 · 패배'
  return (
    <div className="el-result">
      <div className="el-result-head">
        <div>
          <span className="el-kicker">{kicker}</span>
          <p className={`el-result-title el-disp${w === null ? '' : ` w${w}`}`}>
            {w === null ? (
              '무승부'
            ) : (
              <>
                {PLAYER_NAMES[w]} 후보
                <br />
                당선 확정
              </>
            )}
          </p>
        </div>
        <div className={`el-stamp el-disp ${w === null ? 'tie' : `w${w}`}`} aria-hidden="true">
          {w === null ? '무승부' : '당선'}
        </div>
      </div>
      <div className="el-score-cards">
        {([0, 1] as const).map((p) => (
          <div key={p} className={`el-pcard p${p}${w === p ? ' win' : ''}`}>
            <div className="el-pname">
              <Mark p={p} />
              <span className="truncate">
                {PLAYER_NAMES[p]} · {names[p]}
              </span>
            </div>
            <div className="el-pscore-row">
              <b className="el-pscore el-disp">{t[p]}</b>
              <span className="el-pscore-unit">표</span>
            </div>
          </div>
        ))}
      </div>
      {t[0] === t[1] && (
        <p className="el-tie-note">
          총점 동점 — 남은 예비군 {s.reserves[0]} : {s.reserves[1]}
          {w === null ? ', 무승부' : ` 로 ${PLAYER_NAMES[w]} 후보 당선`}
        </p>
      )}
      <TugBar s={s} large />
      <ul className="el-dist" aria-label="권역별 결과">
        {Array.from({ length: HOLE_COUNT }, (_, i) => {
          const g = s.holes[i]
          const b = countColor(g, 0)
          const o = holeOwner(s, i)
          const tie = g.length > 0 && b * 2 === g.length
          return (
            <li key={i}>
              <span className="el-dist-letter el-disp">{HOLE_LABELS[i]}</span>
              <span className="el-dist-name">
                {HOLE_NAMES[i]}
                <span className="el-dist-tally">{g.length ? `${b} : ${g.length - b}${tie ? ' ⚑' : ''}` : '빈 권역'}</span>
              </span>
              <span className={`el-dist-who w${o ?? 'n'}`}>
                {o === null ? (
                  '무효'
                ) : (
                  <>
                    <Mark p={o} />
                    {PLAYER_NAMES[o]}
                  </>
                )}
              </span>
              <span className="el-dist-cap el-disp">{CAP[i]}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
