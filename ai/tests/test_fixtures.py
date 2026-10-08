"""
shared/fixtures/*.json (TS 엔진 출력) 을 읽어 Python 모델·규칙이 TS 와 일치하는지 검증한다.
픽스처가 바뀌면 `npm run fixtures` 로 다시 생성한다.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest
from pydantic import TypeAdapter

from astral_ai.models import Action, GameState
from astral_ai.rules import (
    apply_action,
    compute_influence,
    compute_owners,
    compute_ranking,
    compute_scores,
    legal_plant_cells,
    load_specs,
    market_size,
    next_round_start,
    next_random,
    shuffle,
)

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"
ACTION: TypeAdapter[Any] = TypeAdapter(Action)


@lru_cache(maxsize=1)
def _scenarios() -> list[dict[str, Any]]:
    return json.loads((FIXTURES / "scenario.json").read_text(encoding="utf-8"))


def _strip_log(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if k != "log"}


def test_specs_load() -> None:
    specs = load_specs()
    assert len(specs.species_ids) == 12
    assert len(specs.goal_species) == 18
    assert specs.constants["HAND_SIZE"] == 3
    assert set(specs.player_count_rules) == {2, 3, 4}


def test_rng_is_deterministic() -> None:
    # mulberry32 는 32비트 정수 연산이라 결과가 항상 같아야 한다
    v1, s1 = next_random(12345)
    v2, s2 = next_random(12345)
    assert (v1, s1) == (v2, s2)
    assert 0 <= v1 < 1
    items, _ = shuffle(list(range(10)), 7)
    assert sorted(items) == list(range(10))


@pytest.mark.parametrize("which", [0, 1, 2])
def test_scenario_replay_matches_ts(which: int) -> None:
    sc = _scenarios()[which]
    state = GameState.model_validate(sc["initial"])
    checked_states = 0
    for i, step in enumerate(sc["steps"]):
        action = ACTION.validate_python(step["action"])
        state, err = apply_action(state, action)
        assert err is None, f"{sc['players']}인 {i}단계: {err}"

        if step["state"] is not None:
            mine = _strip_log(state.model_dump(mode="json"))
            assert mine == _strip_log(step["state"]), f"{sc['players']}인 {i}단계 상태 불일치"
            checked_states += 1

        if step["influence"] is not None:
            inf = compute_influence(state)
            assert inf == step["influence"], f"{sc['players']}인 {i}단계 영향력 불일치"
            assert compute_owners(state, inf) == step["owners"], f"{sc['players']}인 {i}단계 땅 불일치"
            scores = {pid: s.model_dump() for pid, s in compute_scores(state).items()}
            assert scores == step["scores"], f"{sc['players']}인 {i}단계 점수 불일치"

        if step["legal"] is not None:
            pid = state.currentPlayerId
            assert pid is not None
            for sp, cells in step["legal"].items():
                mine_cells = [p.model_dump() for p in legal_plant_cells(state, pid, sp)]
                assert mine_cells == cells, f"{sc['players']}인 {i}단계 {sp} 심을 수 있는 칸 불일치"

    assert state.phase == "finished"
    assert checked_states >= 2
    assert state.result is not None
    assert compute_ranking(state) == state.result.ranking


def test_rejects_illegal_actions() -> None:
    sc = _scenarios()[0]
    state = GameState.model_validate(sc["initial"])
    pid = state.currentPlayerId
    other = next(p.id for p in state.players if p.id != pid)
    good = dict(sc["steps"][0]["action"])
    assert state.market and "take" in good

    def rejected(action: dict[str, Any]) -> None:
        after, err = apply_action(state, ACTION.validate_python(action))
        assert err is not None, action
        assert after is state

    # 남의 차례
    rejected({**good, "playerId": other})
    # 마켓에 카드가 있는데 take 없음 / 없는 자리
    rejected({k: v for k, v in good.items() if k != "take"})
    rejected({**good, "take": len(state.market)})
    rejected({**good, "take": -1})
    # 예전 드래프트 행동은 더 이상 없다
    with pytest.raises(Exception):
        ACTION.validate_python({"type": "DRAFT", "playerId": pid, "species": "grass"})


def test_take_moves_card_and_empty_market_rejects_take() -> None:
    sc = _scenarios()[0]
    state = GameState.model_validate(sc["initial"])
    action = ACTION.validate_python(sc["steps"][0]["action"])
    me = next(p for p in state.players if p.id == action.playerId)
    after, err = apply_action(state, action)
    assert err is None
    card = state.market[action.take]
    # 가져간 자리는 채우지 않는다
    assert after.market == [x for i, x in enumerate(state.market) if i != action.take]
    after_me = next(p for p in after.players if p.id == me.id)
    hand = list(me.hand)
    hand.remove(action.species)
    assert after_me.hand == [*hand, card]

    # 마켓이 비면 take 를 넣으면 거부, 빼면 통과
    empty = state.model_copy(update={"market": []})
    _, err = apply_action(empty, action)
    assert err is not None
    _, err = apply_action(empty, action.model_copy(update={"take": None}))
    assert err is None


def test_new_round_reveals_market_and_rotates_first_seat() -> None:
    for sc in _scenarios():
        state = GameState.model_validate(sc["initial"])
        P = len(state.players)
        assert state.round == 1 and len(state.market) == P
        for step in sc["steps"]:
            prev = state
            state, err = apply_action(state, ACTION.validate_python(step["action"]))
            assert err is None
            if state.phase == "playing" and state.round == prev.round + 1:
                # 새 라운드의 첫 자리 = 지난 첫 자리 다음의 기권 안 한 사람, 첫 차례 = 거기서부터 둘 수 있는 첫 사람
                assert state.roundStart == next_round_start(prev)
                by_seat = sorted(state.players, key=lambda p: p.seat)
                start = state.roundStart
                first = next(
                    p for p in (by_seat[(start + k) % P] for k in range(P)) if p.surrenderedOrder is None and p.hand
                )
                assert state.currentPlayerId == first.id
                assert state.market == prev.pile[: market_size(state)]
