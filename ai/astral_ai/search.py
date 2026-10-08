"""
AI 수 결정. 드래프트는 종 가치표, 차례는 1수 탐욕(내 총점 − 가장 높은 상대 총점)이다.
Minimax / max-n 은 다음 단계(F028, F029). 항상 시간 제한(F027, 기본 2초) 안에 합법 수를 돌려준다.
순수 함수: 입력 상태를 변이하지 않고, 같은 입력이면 (시간이 충분할 때) 같은 수를 고른다.
"""

from __future__ import annotations

import time
from typing import Optional

from .models import (
    Action,
    DiscardAction,
    DraftAction,
    GameState,
    Plant,
    PlantAction,
    Position,
    ReadyAction,
    Seed,
)
from .rules import (
    BoardIndex,
    board_index,
    compute_influence,
    compute_scores,
    draft_options,
    get_player,
    is_empty_cell,
    legal_plant_cell_indices,
    line_directions,
    load_specs,
    occupancy,
    species_spec,
)

# 시간 제한 중 응답 직렬화·네트워크 몫으로 남겨 두는 비율과 여유(ms)
_TIME_FRACTION = 0.6
_TIME_MARGIN_MS = 150
# 민들레 씨앗 칸을 따로 펼쳐 볼 상위 칸 수
_SEED_TOP_CELLS = 3

# ---------------------------------------------------------------------------
# 드래프트 가치표 (AI 휴리스틱. 규칙 수치가 아니라 AI 선호도라 여기 둔다)
# ---------------------------------------------------------------------------

# 종 기본 가치 (Rules.md 12절 시뮬레이션 승률을 대략 반영)
_DRAFT_BASE: dict[str, int] = {
    "grass": 5,
    "oak": 6,
    "pine": 5,
    "kudzu": 5,
    "fern": 4,
    "dandelion": 5,
    "rapeseed": 5,
    "lotus": 5,
    "ivy": 6,
    "bamboo": 5,
    "mushroom": 4,
    "mugunghwa": 5,
}

# 공개 목표가 특정 종에 유리할 때 더하는 가치 (보호구역 목표는 specs 의 연계 종으로 따로 처리)
_GOAL_FAVORS: dict[str, dict[str, int]] = {
    "flower-bed": {"rapeseed": 3, "lotus": 3, "mugunghwa": 3},
    "forest": {"oak": 3, "bamboo": 3},
    "fertile-field": {"rapeseed": 2},
    "pond-side": {"lotus": 2},
}
_RESERVE_GOAL_BONUS = 5


def draft_value(species: str, goals: list[str]) -> int:
    """이번 판 공개 목표를 반영한 종 가치."""
    value = _DRAFT_BASE.get(species, 0)
    goal_species = load_specs().goal_species
    for g in goals:
        if goal_species.get(g) == species:
            value += _RESERVE_GOAL_BONUS
        value += _GOAL_FAVORS.get(g, {}).get(species, 0)
    return value


def choose_draft(state: GameState, player_id: str) -> Optional[DraftAction]:
    options = draft_options(state, player_id)
    if not options:
        return None
    # 가치가 같으면 표 순서상 앞의 종 (max 는 첫 최댓값을 돌려준다)
    best = max(options, key=lambda s: draft_value(s, state.goals))
    return DraftAction(playerId=player_id, species=best)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# 차례: 1수 탐욕
# ---------------------------------------------------------------------------


def _evaluate(state: GameState, idx: BoardIndex, player_id: str) -> int:
    """내 총점 − 가장 높은 상대 총점 (기권하지 않은 상대만)."""
    scores = compute_scores(state, idx)
    mine = scores[player_id].total
    rivals = [scores[p.id].total for p in state.players if p.id != player_id and p.surrenderedOrder is None]
    return mine - (max(rivals) if rivals else 0)


def _with_plant(
    state: GameState, player_id: str, species: str, c: int, idx: BoardIndex,
    direction: Optional[int], seed_cell: Optional[int],
) -> GameState:
    """심은 뒤의 보드만 만든다 (손패·차례는 평가에 필요 없다)."""
    q, r = idx.coords[c]
    plant = Plant.model_construct(
        id=f"p{len(state.plants) + 1}", species=species, ownerId=player_id,
        pos=Position.model_construct(q=q, r=r), direction=direction,
    )
    update: dict[str, object] = {"plants": [*state.plants, plant]}
    if seed_cell is not None:
        sq, sr = idx.coords[seed_cell]
        update["seeds"] = [*state.seeds, Seed.model_construct(ownerId=player_id, pos=Position.model_construct(q=sq, r=sr))]
    return state.model_copy(update=update)


def _plant_action(
    player_id: str, species: str, c: int, idx: BoardIndex, direction: Optional[int], seed_cell: Optional[int]
) -> PlantAction:
    q, r = idx.coords[c]
    seed = None
    if seed_cell is not None:
        seed = Position(q=idx.coords[seed_cell][0], r=idx.coords[seed_cell][1])
    return PlantAction(playerId=player_id, species=species, pos=Position(q=q, r=r), direction=direction, seed=seed)  # type: ignore[arg-type]


def choose_play(state: GameState, player_id: str, deadline: float) -> tuple[Action, int]:
    """(행동, 탐색 깊이). 심을 칸이 없으면 첫 손패를 버린다."""
    me = get_player(state, player_id)
    assert me is not None and state.board is not None
    idx = board_index(state.board)
    occ = occupancy(state, idx)
    inf = compute_influence(state, idx, occ)

    # 후보: (종, 칸, 방향 목록)
    candidates: list[tuple[str, int, list[Optional[int]]]] = []
    for sp in dict.fromkeys(me.hand):
        spec = species_spec(sp)
        for c in legal_plant_cell_indices(state, player_id, sp, inf, idx, occ):
            if spec["line"]:
                dirs: list[Optional[int]] = list(line_directions(idx, c, int(spec["lineLength"])))
            else:
                dirs = [None]
            candidates.append((sp, c, dirs))

    if not candidates:
        return DiscardAction(playerId=player_id, species=me.hand[0]), 0  # type: ignore[arg-type]

    # 시간이 모자라도 돌려줄 기본 수: 첫 후보
    sp0, c0, d0 = candidates[0]
    best_action: Action = _plant_action(player_id, sp0, c0, idx, d0[0], None)
    best_value: Optional[int] = None
    depth = 0
    dandelion_scores: list[tuple[int, int]] = []  # (가치, 칸)

    for sp, c, dirs in candidates:
        for d in dirs:
            if time.perf_counter() >= deadline:
                return best_action, depth
            v = _evaluate(_with_plant(state, player_id, sp, c, idx, d, None), idx, player_id)
            if best_value is None or v > best_value:
                best_value = v
                best_action = _plant_action(player_id, sp, c, idx, d, None)
            if species_spec(sp)["seed"]:
                dandelion_scores.append((v, c))
    depth = 1

    # 민들레: 상위 몇 칸만 씨앗 칸을 펼쳐 본다
    if dandelion_scores:
        sp_d = next(sp for sp in me.hand if species_spec(sp)["seed"])
        dandelion_scores.sort(key=lambda t: -t[0])
        for _, c in dandelion_scores[:_SEED_TOP_CELLS]:
            for x in idx.within2[c]:
                if time.perf_counter() >= deadline:
                    return best_action, depth
                if not is_empty_cell(idx, occ, x):
                    continue
                v = _evaluate(_with_plant(state, player_id, sp_d, c, idx, None, x), idx, player_id)
                if best_value is None or v > best_value:
                    best_value = v
                    best_action = _plant_action(player_id, sp_d, c, idx, None, x)
    return best_action, depth


def _fallback(state: GameState, player_id: str) -> Action:
    """내 차례가 아니거나 둘 수 없는 상태. 엔진이 거부해도 해가 없는 행동을 돌려준다."""
    me = get_player(state, player_id)
    if me is not None and me.hand:
        return DiscardAction(playerId=player_id, species=me.hand[0])  # type: ignore[arg-type]
    return ReadyAction(playerId=player_id)


def decide(state: GameState, player_id: str, time_limit_ms: int) -> tuple[Action, int, int]:
    """(행동, 깊이, 걸린 시간 ms). 항상 시간 제한 안에 돌려준다."""
    start = time.perf_counter()
    budget_ms = max(50.0, time_limit_ms * _TIME_FRACTION - _TIME_MARGIN_MS)
    deadline = start + budget_ms / 1000.0

    action: Action
    depth = 0
    if state.currentPlayerId != player_id:
        action = _fallback(state, player_id)
    elif state.phase == "drafting":
        action = choose_draft(state, player_id) or _fallback(state, player_id)
    elif state.phase == "playing" and state.board is not None and get_player(state, player_id) is not None:
        me = get_player(state, player_id)
        if me is not None and me.hand:
            action, depth = choose_play(state, player_id, deadline)
        else:
            action = _fallback(state, player_id)
    else:
        action = _fallback(state, player_id)
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    return action, depth, elapsed_ms
