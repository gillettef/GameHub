import json
from pathlib import Path

from fastapi.testclient import TestClient

from astral_ai.main import app

client = TestClient(app)
FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


def _first_turn() -> dict:
    return json.loads((FIXTURES / "first-turn.json").read_text(encoding="utf-8"))


def test_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_decide_returns_legal_action_for_current_player() -> None:
    res = client.post("/decide", json={"state": _first_turn(), "playerId": "p0", "timeLimitMs": 2000})
    assert res.status_code == 200
    body = res.json()
    assert body["action"]["playerId"] == "p0"
    assert body["action"]["type"] in {"PLACE", "PASS"}
    assert body["elapsedMs"] < 2000


def test_decide_passes_when_not_my_turn() -> None:
    res = client.post("/decide", json={"state": _first_turn(), "playerId": "ai-1", "timeLimitMs": 2000})
    assert res.status_code == 200
    assert res.json()["action"] == {"type": "PASS", "playerId": "ai-1", "discardCardIds": None}


def test_decide_rejects_invalid_payload() -> None:
    res = client.post("/decide", json={"state": {}, "playerId": "ai-1"})
    assert res.status_code == 422
