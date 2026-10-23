/** 처음 하는 사람을 위한 상황별 도움말. 한 번 본 것과 「그만 보기」는 이 기기에 기억한다 */
import { useState } from 'react'

export type TipId = 'take' | 'place' | 'round2' | 'round3' | 'round4'

export const TIPS: Record<TipId, { title: string; text: string }> = {
  take: {
    title: '시장에서 묶음 가져오기',
    text: '시장 칸을 한 번 누르면 그 칸 주사위의 전개도가 보여요. 한 번 더 누르거나 아래 「가져오기」를 누르면 묶음을 통째로 가져와요.',
  },
  place: {
    title: '주사위 놓기',
    text: '빛나는 칸을 누르면 미리 보이고, 한 번 더 누르면 놓여요. 칸 위의 +숫자는 거기 놓았을 때 늘어나는 점수예요. 앞면은 맨 앞줄 「정면 숫자선」 점수와 4라운드 굴리기에 쓰여요.',
  },
  round2: {
    title: '2라운드 · 평면',
    text: '선 뒤쪽 칸 중 이미 놓인 주사위와 맞닿은 칸에만 놓아요. 같은 색으로 이어진 영역(3칸 이상)과 윗면이 1 차이 나는 이웃이 점수예요.',
  },
  round3: {
    title: '3라운드 · 입체',
    text: '기둥 꼭대기에 아래보다 큰 숫자만 쌓아요. ⧗은 어디든 올릴 수 있지만 ⧗ 위에는 못 쌓아요. 놓을 곳이 없으면 잔해(−1점)가 돼요. 보드 칸을 누르면 기둥을 층마다 펼쳐 볼 수 있어요.',
  },
  round4: {
    title: '4라운드 · 시간',
    text: '주황 점이 찍힌 ⧗ 꼭대기 주사위를 골라 옆 칸으로 한 칸 굴려요. 굴린 방향 반대쪽 옆면이 새 윗면이 돼요. 굴릴 수 없는 주사위는 잔해가 돼요.',
  },
}

const KEY = 'tesseract.tips'

interface TipStore {
  seen: TipId[]
  off: boolean
}

function load(): TipStore {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as Partial<TipStore>) : {}
    return { seen: Array.isArray(v.seen) ? v.seen : [], off: v.off === true }
  } catch {
    return { seen: [], off: false }
  }
}

function save(v: TipStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // 저장할 수 없으면 이번 실행 동안만 기억
  }
}

/** 보여 줄 도움말을 고르고 닫는 훅. wanted 중 아직 안 본 첫 번째를 돌려준다 */
export function useTip(wanted: (TipId | null)[]): { tip: TipId | null; dismiss: () => void; turnOff: () => void } {
  const [store, setStore] = useState(load)
  const tip = store.off ? null : (wanted.find((t): t is TipId => t !== null && !store.seen.includes(t)) ?? null)
  const update = (v: TipStore) => {
    setStore(v)
    save(v)
  }
  return {
    tip,
    dismiss: () => {
      if (tip) update({ ...store, seen: [...store.seen, tip] })
    },
    turnOff: () => update({ ...store, off: true }),
  }
}

/** 도움말을 다시 켠다 (규칙 시트에서). 다음에 게임 화면을 열 때부터 적용 */
export function resetTips(): void {
  save({ seen: [], off: false })
}
