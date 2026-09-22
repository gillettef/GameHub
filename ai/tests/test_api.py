from fastapi.testclient import TestClient

from astral_ai.main import app

client = TestClient(app)


def _playing_state() -> dict:
    return {
        "roomId": "room-1",
        "phase": "playing",
        "turn": 0,
        "currentPlayerId": "ai-1",
        "players": [
            {"id": "p1", "nickname": "철수", "kind": "human", "resources": 10, "mana": 5},
            {"id": "ai-1", "nickname": "AI", "kind": "ai", "resources": 10, "mana": 5},
        ],
        "board": {"width": 10, "height": 10},
        "log": [],
    }


def test_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_decide_returns_action_for_player() -> None:
    res = client.post("/decide", json={"state": _playing_state(), "playerId": "ai-1", "timeLimitMs": 2000})
    assert res.status_code == 200
    body = res.json()
    assert body["action"]["playerId"] == "ai-1"
    assert body["elapsedMs"] < 2000


def test_decide_rejects_invalid_payload() -> None:
    res = client.post("/decide", json={"state": {}, "playerId": "ai-1"})
    assert res.status_code == 422
