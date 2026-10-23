import { describe, expect, it } from 'vitest'
import { LAWS, PERSONAL_GOALS, ROUND_GOALS, type LawId, type PersonalGoalId, type RoundGoalId } from '../../engine'
import { ART_H, ART_W, cardArt, cardInfo, cardStars, type CardKey } from '../cardArtData'

const all: CardKey[] = [
  ...(Object.keys(LAWS) as LawId[]).map((id) => ({ kind: 'law' as const, id })),
  ...(Object.keys(ROUND_GOALS) as RoundGoalId[]).map((id) => ({ kind: 'goal' as const, id })),
  ...(Object.keys(PERSONAL_GOALS) as PersonalGoalId[]).map((id) => ({ kind: 'personal' as const, id })),
]

describe('카드 일러스트 (cardArtData)', () => {
  it.each(all.map((c) => [`${c.kind}:${c.id}`, c] as const))('%s 에 그림이 있고 그림 영역 안에 들어간다', (_, card) => {
    const shapes = cardArt(card)
    expect(shapes.length).toBeGreaterThan(0)
    for (const s of shapes) {
      if (s.t === 'die' || s.t === 'slot') {
        expect(s.x).toBeGreaterThanOrEqual(0)
        expect(s.y).toBeGreaterThanOrEqual(0)
        expect(s.x + s.s).toBeLessThanOrEqual(ART_W)
        expect(s.y + s.s).toBeLessThanOrEqual(ART_H)
      }
    }
  })

  it('카드 정보: 라운드 목표는 선착·달성 두 점수, 개인 목표는 하나, 법칙은 없음', () => {
    expect(cardInfo({ kind: 'goal', id: 'skyscraper' }).points).toHaveLength(2)
    expect(cardInfo({ kind: 'personal', id: 'timeLord' }).points).toHaveLength(1)
    expect(cardInfo({ kind: 'law', id: 'mirror' }).points).toHaveLength(0)
  })

  it('별 배치는 카드마다 늘 같다', () => {
    expect(cardStars('goal:mirror')).toEqual(cardStars('goal:mirror'))
    expect(cardStars('goal:mirror')).not.toEqual(cardStars('goal:rainbow'))
  })
})
