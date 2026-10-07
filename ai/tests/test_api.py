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
    """각 시나리오에서 진행 중인 체크포인트 상태 몇 개."""
    out: list[dict[str, Any]] = []
    for sc in _scenarios():
        states = [s["state"] for s in sc["steps"] if s["state"] is not None and s["state"]["phase"] == "playing"]
        out.extend([states[0], states[len(states) // 2], states[-1]])
    return out


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


def test_decide_draft_is_legal() -> None:
    for sc in _scenarios():
        state = sc["initial"]
        pid = state["currentPlayerId"]
        body = _post(state, pid)
        assert body["action"]["type"] == "DRAFT"
        _, err = apply_action(GameState.model_validate(state), ACTION.validate_python(body["action"]))
        assert err is None


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
            if action["species"] != "vine":
                assert "direction" not in action
        _, err = apply_action(GameState.model_validate(state), ACTION.validate_python(action))
        assert err is None, err


def test_decide_with_masked_state() -> None:
    # 서버가 가린 상태(타인 손패·덱 빈 배열, handCount/deckCount 추가)도 받는다
    state = json.loads(json.dumps(_playing_states()[1]))
    pid = state["currentPlayerId"]
    for p in state["players"]:
        p["handCount"] = len(p["hand"])
        p["deckCount"] = len(p["deck"])
        p["deck"] = []
        if p["id"] != pid:
            p["hand"] = []
    body = _post(state, pid)
    assert body["action"]["type"] in {"PLANT", "DISCARD"}


def test_decide_respects_tiny_time_limit() -> None:
    state = _playing_states()[0]
    res = client.post("/decide", json={"state": state, "playerId": state["currentPlayerId"], "timeLimitMs": 100})
    assert res.status_code == 200
    action = res.json()["action"]
    _, err = apply_action(GameState.model_validate(state), ACTION.validate_python(action))
    assert err is None


def test_decide_rejects_invalid_payload() -> None:
    res = client.post("/decide", json={"state": {}, "playerId": "p1"})
    assert res.status_code == 422
