import type { IconName } from "./Icons";
import type { StatKey } from "./gameTypes";

// 능력치·기운 종류별 고정 아이콘/색 (상태 비교표, 카드 속성/효과/비용 표시에서 함께 쓴다)
export type ColumnKey = StatKey | "credit" | "intelligenceTokens" | "staminaTokens" | "charmTokens" | "manaTokens";

export interface ColumnStyle {
  icon: IconName;
  label: string;
  // 아이콘/글자 색, 옅은 배경색
  text: string;
  bg: string;
}

export const COLUMN_STYLE: Record<ColumnKey, ColumnStyle> = {
  intelligence: { icon: "bulb", label: "지력", text: "text-sky-700", bg: "bg-sky-100" },
  stamina: { icon: "bolt", label: "체력", text: "text-green-700", bg: "bg-green-100" },
  charm: { icon: "heart", label: "매력", text: "text-pink-700", bg: "bg-pink-100" },
  spellPower: { icon: "sparkle", label: "주문력", text: "text-purple-700", bg: "bg-purple-100" },
  credit: { icon: "cap", label: "학점", text: "text-amber-700", bg: "bg-amber-100" },
  intelligenceTokens: { icon: "intToken", label: "지력기운", text: "text-sky-700", bg: "bg-sky-50" },
  staminaTokens: { icon: "staminaToken", label: "체력기운", text: "text-green-700", bg: "bg-green-50" },
  charmTokens: { icon: "charmToken", label: "매력기운", text: "text-pink-700", bg: "bg-pink-50" },
  manaTokens: { icon: "manaToken", label: "마나기운", text: "text-indigo-700", bg: "bg-indigo-50" },
};
