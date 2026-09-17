import { activeSide } from '@server/engine/cards';
import { swapBenchTokens } from '@server/engine/friday';
import { sectorCounts } from '@server/engine/match';
import type { PlayerInstance, UniformToken } from '@server/engine/state';
import { SECTORS } from '@server/engine/types';
import type { Formation, Sector } from '@server/engine/types';
import { SECTOR_LABEL } from './labels';

// 출전 선수를 고른 뒤 벤치 토큰 교환까지 반영한 필드 토큰 (엔진과 같은 규칙)
export function previewField(uniforms: UniformToken[], played: string[]): UniformToken[] {
  const clone = structuredClone(uniforms);
  try {
    swapBenchTokens({ uniforms: clone }, played);
  } catch {
    /* 교환할 토큰이 없으면 서버가 거부한다. 미리보기는 현재 필드로 */
  }
  return clone.filter((u) => u.location === 'field');
}

function zonesOf(roster: PlayerInstance[], instanceId: string | undefined): Sector[] | null {
  const inst = instanceId ? roster.find((r) => r.instanceId === instanceId) : undefined;
  return inst ? activeSide(inst).zones : null;
}

// 허용 구획이 적은 출전 선수부터 채우고 나머지 토큰은 남는 자리에. 못 넣은 토큰은 비워둔다
export function autoPlace(field: UniformToken[], roster: PlayerInstance[], played: string[], formation: Formation): Record<string, Sector> {
  const need = sectorCounts(formation);
  const placements: Record<string, Sector> = {};
  const carded = field.filter((u) => u.cardInstanceId && played.includes(u.cardInstanceId));
  carded.sort((a, b) => (zonesOf(roster, a.cardInstanceId)?.length ?? 9) - (zonesOf(roster, b.cardInstanceId)?.length ?? 9));
  for (const token of carded) {
    const sector = zonesOf(roster, token.cardInstanceId)?.find((z) => need[z] > 0);
    if (!sector) continue;
    placements[token.id] = sector;
    need[sector]--;
  }
  for (const token of field) {
    if (token.id in placements) continue;
    const sector = SECTORS.find((z) => need[z] > 0);
    if (!sector) break;
    placements[token.id] = sector;
    need[sector]--;
  }
  return placements;
}

export function validatePlacements(field: UniformToken[], roster: PlayerInstance[], played: string[], formation: Formation, placements: Record<string, Sector>): string[] {
  const issues: string[] = [];
  const need = sectorCounts(formation);
  const counts: Record<Sector, number> = { LW: 0, CB: 0, CM: 0, CF: 0, RW: 0 };
  for (const token of field) {
    const sector = placements[token.id];
    if (!sector) {
      issues.push(`토큰 ${token.number ?? '∅'} 미배치`);
      continue;
    }
    counts[sector]++;
    const zones = token.cardInstanceId && played.includes(token.cardInstanceId) ? zonesOf(roster, token.cardInstanceId) : null;
    if (zones && !zones.includes(sector)) issues.push(`토큰 ${token.number ?? '∅'}: ${SECTOR_LABEL[sector]} 배치 불가`);
  }
  for (const s of SECTORS) if (counts[s] !== need[s]) issues.push(`${SECTOR_LABEL[s]} ${counts[s]}/${need[s]}`);
  return issues;
}
