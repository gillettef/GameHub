"""
AI 수 결정. 라운드는 가져오기 단계 → 심기 단계로 나뉜다(Rules.md 5절).
가져오기: 마켓 카드마다 "지금 보드에서 손 카드 + 그 카드 중 최선 1수 가치 + 공개 목표 연계 가산"을 매겨 고른다.
심기: 손 카드 전부에 대해 1수 탐욕(내 총점 − 가장 높은 상대 총점)으로 고른다. 공개 단계면 확인한다.
Minimax / max-n 은 다음 단계(F028, F029). 항상 시간 제한(F027, 기본 2초) 안에 합법 수를 돌려준다.
순수 함수: 입력 상태를 변이하지 않고, 같은 입력이면 (시간이 충분할 때) 같은 수를 고른다.
"""

from __future__ import annotations

import time
from typing import Optional

from .models import (
    Action,
    DiscardAction,
    GameState,
    Plant,
    PlantAction,
    Position,
    ReadyAction,
    Seed,
    TakeAction,
)
from .rules import (
    FLOWER_SPECIES,
    auto_action,
    FOREST_SPECIES,
    BoardIndex,
    board_index,
    compute_influence,
    compute_scores,
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
# 가져오기 목표 연계 가산 (AI 휴리스틱. 규칙 수치가 아니라 AI 선호도라 여기 둔다)
# ---------------------------------------------------------------------------

# 공개 보호구역 목표의 종
_RESERVE_TAKE_BONUS = 3
# 꽃밭 목표의 꽃, 숲 목표의 나무
_FLOWER_TAKE_BONUS = 2
_FOREST_TAKE_BONUS = 2
# 여러 가지 심기 목표: 아직 심지 않은(손에도 없는) 새 종
_VARIETY_TAKE_BONUS = 1


def take_goal_bonus(state: GameState, player_id: str, species: str) -> int:
    """공개 목표가 이 카드를 반길 때 더하는 가치."""
    bonus = 0
    goal_species = load_specs().goal_species
    for g in state.goals:
        if goal_species.get(g) == species:
            bonus += _RESERVE_TAKE_BONUS
        elif g == "flower-bed" and species in FLOWER_SPECIES:
            bonus += _FLOWER_TAKE_BONUS
        elif g == "forest" and species in FOREST_SPECIES:
            bonus += _FOREST_TAKE_BONUS
        elif g == "variety":
            me = get_player(state, player_id)
            planted = {p.species for p in state.plants if p.ownerId == player_id}
            if species not in planted and (me is None or species not in me.hand):
                bonus += _VARIETY_TAKE_BONUS
    return bonus


# ---------------------------------------------------------------------------
# 평가 도우미
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
    """심은 뒤의 보드만 만든다 (손·마켓·차례는 평가에 필요 없다)."""
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


def _candidates(state: GameState, player_id: str, species_list: list[str], idx: BoardIndex) -> list[tuple[str, int, list[Optional[int]]]]:
    """(종, 칸, 방향 목록) 후보. 칸 순서(r → q)."""
    occ = occupancy(state, idx)
    inf = compute_influence(state, idx, occ)
    out: list[tuple[str, int, list[Optional[int]]]] = []
    for sp in species_list:
        spec = species_spec(sp)
        for c in legal_plant_cell_indices(state, player_id, sp, inf, idx, occ):
            if spec["line"]:
                dirs: list[Optional[int]] = list(line_directions(idx, c, int(spec["lineLength"])))
            else:
                dirs = [None]
            out.append((sp, c, dirs))
    return out


# ---------------------------------------------------------------------------
# 심기 단계: 1수 탐욕
# ---------------------------------------------------------------------------


def choose_plant(state: GameState, player_id: str, deadline: float) -> tuple[Action, GameState, int]:
    """(심기·버리기 행동, 그 수를 둔 뒤의 보드, 탐색 깊이). 심을 칸이 없으면 첫 손 카드를 버린다."""
    me = get_player(state, player_id)
    assert me is not None and state.board is not None
    idx = board_index(state.board)
    occ = occupancy(state, idx)
    candidates = _candidates(state, player_id, list(dict.fromkeys(me.hand)), idx)

    if not candidates:
        return DiscardAction(playerId=player_id, species=me.hand[0]), state, 0  # type: ignore[arg-type]

    # 시간이 모자라도 돌려줄 기본 수: 첫 후보
    sp0, c0, d0 = candidates[0]
    best: tuple[str, int, Optional[int], Optional[int]] = (sp0, c0, d0[0], None)
    best_value: Optional[int] = None
    depth = 0
    dandelion_scores: list[tuple[int, int]] = []  # (가치, 칸)

    def result() -> tuple[Action, GameState, int]:
        sp, c, d, x = best
        return _plant_action(player_id, sp, c, idx, d, x), _with_plant(state, player_id, sp, c, idx, d, x), depth

    for sp, c, dirs in candidates:
        for d in dirs:
            if time.perf_counter() >= deadline:
                return result()
            v = _evaluate(_with_plant(state, player_id, sp, c, idx, d, None), idx, player_id)
            if best_value is None or v > best_value:
                best_value = v
                best = (sp, c, d, None)
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
                    return result()
                if not is_empty_cell(idx, occ, x):
                    continue
                v = _evaluate(_with_plant(state, player_id, sp_d, c, idx, None, x), idx, player_id)
                if best_value is None or v > best_value:
                    best_value = v
                    best = (sp_d, c, None, x)
    return result()


# ---------------------------------------------------------------------------
# 가져오기 단계
# ---------------------------------------------------------------------------


class _OutOfTime(Exception):
    pass


def _best_value(
    state: GameState, player_id: str, species_list: list[str], idx: BoardIndex, deadline: float
) -> Optional[int]:
    """지금 보드에서 이 종들 중 하나를 가장 좋은 칸에 심었을 때의 1수 가치 (씨앗 제외). 심을 칸이 없으면 None."""
    best: Optional[int] = None
    for sp, c, dirs in _candidates(state, player_id, species_list, idx):
        for d in dirs:
            if time.perf_counter() >= deadline:
                raise _OutOfTime
            v = _evaluate(_with_plant(state, player_id, sp, c, idx, d, None), idx, player_id)
            if best is None or v > best:
                best = v
    return best


def choose_take(state: GameState, player_id: str, deadline: float) -> tuple[int, int]:
    """(가져올 마켓 자리, 탐색 깊이). 시간 안에 다 평가하지 못하면 0번.
    후보 카드마다 "지금 보드에서 손 카드 + 그 카드 중 최선 1수 가치 + 공개 목표 연계 가산"을 매긴다.
    동점이면 그 카드 자체의 1수 가치가 큰 쪽(다음 라운드에도 쓸모), 그래도 같으면 앞 자리."""
    me = get_player(state, player_id)
    if not state.market or me is None or state.board is None:
        return 0, 0
    idx = board_index(state.board)
    try:
        hand_value = _best_value(state, player_id, list(dict.fromkeys(me.hand)), idx, deadline)
        no_move = _evaluate(state, idx, player_id) - 100
        best_i = 0
        best_key: Optional[tuple[int, int]] = None
        seen: set[str] = set()
        for i, sp in enumerate(state.market):
            # 같은 종이 여러 장이면 앞 자리 하나만 본다
            if sp in seen:
                continue
            seen.add(sp)
            own = _best_value(state, player_id, [sp], idx, deadline)
            # 심을 칸이 없는 카드: 지금 보드 가치에서 크게 깎는다
            own_v = own if own is not None else no_move
            card_value = max(own_v, hand_value) if hand_value is not None else own_v
            key = (card_value + take_goal_bonus(state, player_id, sp), own_v)
            if best_key is None or key > best_key:
                best_key = key
                best_i = i
    except _OutOfTime:
        return 0, 0
    return best_i, 1


# ---------------------------------------------------------------------------
# 결정
# ---------------------------------------------------------------------------


def _fallback(state: GameState, player_id: str) -> Action:
    """내 차례가 아니거나 둘 수 없는 상태. 엔진 자동 수와 같은 수, 그것도 없으면 엔진이 거부해도 해가 없는 행동."""
    auto = auto_action(state, player_id)
    if auto is not None:
        return auto
    return ReadyAction(playerId=player_id)


def decide(state: GameState, player_id: str, time_limit_ms: int) -> tuple[Action, int, int]:
    """(행동, 깊이, 걸린 시간 ms). 항상 시간 제한 안에 돌려준다.
    공개 단계 → 확인, 가져오기 단계 → 마켓 카드 고르기, 심기 단계 → 1수 탐욕 심기(못 심으면 버리기)."""
    start = time.perf_counter()
    budget_ms = max(50.0, time_limit_ms * _TIME_FRACTION - _TIME_MARGIN_MS)
    deadline = start + budget_ms / 1000.0

    action: Action
    depth = 0
    me = get_player(state, player_id)
    my_turn = (
        state.currentPlayerId == player_id
        and state.phase == "playing"
        and state.board is not None
        and me is not None
        and me.surrenderedOrder is None
    )
    if my_turn and state.stage == "take" and state.market:
        take, depth = choose_take(state, player_id, deadline)
        action = TakeAction(playerId=player_id, take=take)
    elif my_turn and state.stage == "plant" and me is not None and me.hand:
        action, _, depth = choose_plant(state, player_id, deadline)
    else:
        action = _fallback(state, player_id)
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    return action, depth, elapsed_ms
