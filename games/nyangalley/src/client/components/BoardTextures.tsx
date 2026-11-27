import { memo } from 'react';
import type { CellView } from '../game/derived';
import { ART_BASE, catArtId, hideoutArtId, terrainArtId } from '../lib/hexGeometry';

/**
 * 보드 그림 정의 (2026-11-26 「냥냥 골목」, 클로드 디자인 그림 `public/art/`).
 * 지형 칸 4종과 이번 판 무리(`crews`)의 아지트·고양이 토큰을 `<defs>` 안 `<image>` 하나씩으로 두고, 칸마다 `<use>` 로 다시 쓴다.
 * 같은 그림 파일은 브라우저가 한 번만 받아 풀어 두므로, 4인 105칸에서도 그림 요청·해석은 4 + 무리 수×2 번뿐이다.
 * 그림은 모두 반지름 1(꼭짓점까지) 기준이라 `<use transform="translate(..) scale(r)">` 로 크기를 정한다.
 * 그림 id·경로는 lib/hexGeometry.ts.
 */
const TERRAINS = Object.keys(terrainArtId) as CellView['terrain'][];

/** 지형 칸·아지트(viewBox −100..100)와 고양이 토큰(−50..50)은 모두 반지름 1 정사각형(−1..1)에 그린다 */
function Art({ id, file }: { id: string; file: string }) {
  return <image id={id} href={`${ART_BASE}${file}.svg`} x={-1} y={-1} width={2} height={2} />;
}

export const BoardTextures = memo(function BoardTextures({ crews }: { crews: readonly number[] }) {
  const used = [...new Set(crews)];
  return (
    <defs>
      {TERRAINS.map((t) => (
        <Art key={t} id={terrainArtId[t]} file={`terrain-${t}`} />
      ))}
      {used.map((s) => (
        <Art key={`h${s}`} id={hideoutArtId(s)} file={`hideout-${s}`} />
      ))}
      {used.map((s) => (
        <Art key={`c${s}`} id={catArtId(s)} file={`cat-${s}`} />
      ))}
    </defs>
  );
});
