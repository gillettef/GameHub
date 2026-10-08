"""FastAPI /health, /decide 가 시간 제한 안에 합법 수를 돌려주는지 확인한다."""

from __future__ import annotations

import json
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from astral_ai.main import app
from astral_ai.models import Action, GameState
from astral_ai.rules import apply_action

client = TestClient(app)
FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"
ACTION: TypeAdapter[Any] = TypeAdapter(Action)
LIMIT_MS = 2000


@lru_cache(maxsize=1)
def _scenarios() -> list[dict[str, Any]]:
    return json.loads((FIXTURES / "scenario.json").read_text(encoding="utf-8"))


def _playing_states() -> list[dict[str, Any]]:
    """각 시나리오에서 진행 중인 체크포인트 상태 몇 개 (시작 상태 포함)."""
    out: list[dict[str, Any]] = []
    for sc in _scenarios():
        states = [s["state"] for s in sc["steps"] if s["state"] is not None and s["state"]["phase"] == "playing"]
        out.extend([sc["initial"], states[0], states[len(states) // 2], states[-1]])
    return out


@lru_cache(maxsize=1)
def _replayed_states() -> list[dict[str, Any]]:
    """시나리오를 Python 규칙으로 재생한 진행 중 상태 전부 (마켓이 빈 라운드 포함)."""
    out: list[dict[str, Any]] = []
    for sc in _scenarios():
        state = GameState.model_validate(sc["initial"])
        for step in sc["steps"]:
            if state.phase == "playing":
                out.append(state.model_dump(mode="json"))
            state, err = apply_action(state, ACTION.validate_python(step["action"]))
            assert err is None
    return out


def _assert_legal(state: dict[str, Any], action: dict[str, Any]) -> None:
    _, err = apply_action(GameState.model_validate(state), ACTION.validate_python(action))
    assert err is None, err


def _post(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    start = time.perf_counter()
    res = client.post("/decide", json={"state": state, "playerId": player_id, "timeLimitMs": LIMIT_MS})
    wall_ms = (time.perf_counter() - start) * 1000
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["elapsedMs"] < LIMIT_MS
    assert wall_ms < LIMIT_MS
    return body


def test_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "rootbound-ai"}


def test_decide_play_is_legal_and_omits_none_fields() -> None:
    for state in _playing_states():
        pid = state["currentPlayerId"]
        body = _post(state, pid)
        action = body["action"]
        assert action["playerId"] == pid
        assert action["type"] in {"PLANT", "DISCARD"}
        if action["type"] == "PLANT":
            # TS 검증은 null 을 "값 있음"으로 보므로 None 필드는 빠져 있어야 한다
            assert action.get("direction", 0) is not None
            assert action.get("seed", {}) is not None
            if action["species"] != "kudzu":
                assert "direction" not in action
        if state["market"]:
            assert 0 <= action["take"] < len(state["market"])
        else:
            assert "take" not in action
        _assert_legal(state, action)


def test_decide_takes_from_market() -> None:
    states = [s for s in _replayed_states() if s["market"]]
    assert states
    for state in states[:: max(1, len(states) // 6)]:
        action = _post(state, state["currentPlayerId"])["action"]
        assert isinstance(action["take"], int) and 0 <= action["take"] < len(state["market"])
        _assert_legal(state, action)


def test_decide_omits_take_when_market_empty() -> None:
    states = [s for s in _replayed_states() if not s["market"]]
    assert states  # 더미가 떨어진 뒤 라운드
    for state in states[:: max(1, len(states) // 4)]:
        action = _post(state, state["currentPlayerId"])["action"]
        assert "take" not in action
        _assert_legal(state, action)


def test_take_prefers_reserve_species() -> None:
    # 목표 연계 가산: 보호구역 종이 마켓에 있으면 다른 조건이 같을 때 그 카드를 고른다
    from astral_ai.models import GameState as GS
    from astral_ai.search import take_goal_bonus

    state = GS.model_validate(_scenarios()[0]["initial"])
    reserve = next(g for g in state.goals if g.endswith("-reserve"))
    sp = reserve[: -len("-reserve")]
    pid = state.currentPlayerId
    assert pid is not None
    others = [x for x in state.species if x != sp]
    assert take_goal_bonus(state, pid, sp) > max(take_goal_bonus(state, pid, x) for x in others)


def test_decide_with_masked_state() -> None:
    # 서버가 가린 상태(타인 손 빈 배열 + handCount, 더미 빈 배열 + pileCount, 시드 0)도 받는다
    state = json.loads(json.dumps(_playing_states()[1]))
    pid = state["currentPlayerId"]
    state["pileCount"] = len(state["pile"])
    state["pile"] = []
    state["rngSeed"] = 0
    state["deckSeed"] = []
    for p in state["players"]:
        p["handCount"] = len(p["hand"])
        if p["id"] != pid:
            p["hand"] = []
    body = _post(state, pid)
    assert body["action"]["type"] in {"PLANT", "DISCARD"}
    _assert_legal(state, body["action"])
    # 가린 필드는 모델에 남되 직렬화에서는 빠진다
    model = GameState.model_validate(state)
    assert model.pileCount == state["pileCount"] and "pileCount" not in model.model_dump()


def test_decide_ignores_old_draft_fields() -> None:
    # 예전 형식 필드(drafted/deck/draftOrder)가 섞여 와도 무시한다
    state = json.loads(json.dumps(_playing_states()[0]))
    state["draftOrder"] = ["p0"]
    state["draftIndex"] = 0
    for p in state["players"]:
        p["drafted"] = ["grass"]
        p["deck"] = ["grass"]
    body = _post(state, state["currentPlayerId"])
    _assert_legal(state, body["action"])


def test_decide_respects_tiny_time_limit() -> None:
    state = _playing_states()[0]
    res = client.post("/decide", json={"state": state, "playerId": state["currentPlayerId"], "timeLimitMs": 100})
    assert res.status_code == 200
    action = res.json()["action"]
    assert "take" in action  # 시간이 모자라도 마켓이 있으면 take 를 넣는다
    _assert_legal(state, action)


def test_decide_rejects_invalid_payload() -> None:
    res = client.post("/decide", json={"state": {}, "playerId": "p1"})
    assert res.status_code == 422


def _mask_for(state: dict[str, Any], viewer: str) -> dict[str, Any]:
    """shared/src/mask.ts maskState(state, viewerId) 와 같은 모양: 시드·더미 가림, 남의 손은 장수만."""
    s = json.loads(json.dumps(state))
    s["rngSeed"] = 0
    s["deckSeed"] = []
    s["pileCount"] = len(s["pile"])
    s["pile"] = []
    for p in s["players"]:
        p["handCount"] = len(p["hand"])
        if p["id"] != viewer:
            p["hand"] = []
    return s


def test_decide_with_server_masked_states() -> None:
    # 서버는 AI 에 maskState(state, aiId) 를 보낸다. 마켓이 있는/빈 라운드, 기권 뒤 상태 모두 합법 수여야 한다
    states = _replayed_states()
    sample = states[:: max(1, len(states) // 12)]
    assert any(s["market"] for s in sample) and any(not s["market"] for s in sample)
    assert any(p["surrenderedOrder"] is not None for s in states for p in s["players"])
    sample += [s for s in states if any(p["surrenderedOrder"] is not None for p in s["players"])][:3]
    for state in sample:
        pid = state["currentPlayerId"]
        action = _post(_mask_for(state, pid), pid)["action"]
        assert ("take" in action) == bool(state["market"])
        # 가리지 않은 원본 상태에 적용해도 합법이다 (엔진은 원본에 적용한다)
        _assert_legal(state, action)
