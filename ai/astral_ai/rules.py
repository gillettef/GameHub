"""
Minimax 탐색용 규칙 시뮬레이션. shared/src/engine 의 사본이며 반드시 같은 결과를 내야 한다.
순수 함수. 입력 상태를 변이하지 않는다.

기준표는 shared/fixtures/specs.json 을 읽어 TS 와 같은 값을 쓴다.
Phase 1 범위: 생산량(F020), 영토·점수(F025). 배치·전투는 Phase 2 에서 TS 와 함께 추가한다.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .models import BuildingSpec, GameState, MagicSpec, Production, UnitSpec

# shared/src/data/index.ts 와 같은 값
TERRITORY_RADIUS = 1
SCORE_PER_TERRITORY_CELL = 1

_FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


class Specs:
    def __init__(self, buildings: list[BuildingSpec], units: list[UnitSpec], magics: list[MagicSpec]):
        self.buildings = {b.id: b for b in buildings}
        self.units = {u.id: u for u in units}
        self.magics = {m.id: m for m in magics}


@lru_cache(maxsize=1)
def load_specs() -> Specs:
    raw = json.loads((_FIXTURES / "specs.json").read_text(encoding="utf-8"))
    return Specs(
        buildings=[BuildingSpec.model_validate(b) for b in raw["buildings"]],
        units=[UnitSpec.model_validate(u) for u in raw["units"]],
        magics=[MagicSpec.model_validate(m) for m in raw["magics"]],
    )


def compute_production(state: GameState, player_id: str) -> Production:
    """TS computeProduction 과 동일: 보유 건물 생산량 합계."""
    specs = load_specs()
    resources = 0
    mana = 0
    for b in state.buildings:
        if b.ownerId != player_id:
            continue
        spec = specs.buildings.get(b.specId)
        if spec is None:
            continue
        resources += spec.production.resources
        mana += spec.production.mana
    return Production(resources=resources, mana=mana)


def compute_territory(state: GameState) -> dict[str, list[tuple[int, int]]]:
    """TS computeTerritory 와 동일: 건물 주변 반경 내 칸. 여러 소유자가 겹치면 누구에게도 주지 않음."""
    claims: dict[tuple[int, int], set[str]] = {}
    for b in state.buildings:
        for dx in range(-TERRITORY_RADIUS, TERRITORY_RADIUS + 1):
            for dy in range(-TERRITORY_RADIUS, TERRITORY_RADIUS + 1):
                x, y = b.pos.x + dx, b.pos.y + dy
                if x < 0 or y < 0 or x >= state.board.width or y >= state.board.height:
                    continue
                claims.setdefault((x, y), set()).add(b.ownerId)
    result: dict[str, list[tuple[int, int]]] = {p.id: [] for p in state.players}
    for cell, owners in claims.items():
        if len(owners) != 1:
            continue
        owner = next(iter(owners))
        if owner in result:
            result[owner].append(cell)
    return result


def compute_scores(state: GameState) -> dict[str, dict[str, int]]:
    """TS computeScores 와 동일."""
    specs = load_specs()
    territory = compute_territory(state)
    scores: dict[str, dict[str, int]] = {}
    for p in state.players:
        t = len(territory.get(p.id, [])) * SCORE_PER_TERRITORY_CELL
        b = sum(
            (specs.buildings[x.specId].score if x.specId in specs.buildings else 0)
            for x in state.buildings
            if x.ownerId == p.id
        )
        scores[p.id] = {"territory": t, "buildings": b, "total": t + b}
    return scores
