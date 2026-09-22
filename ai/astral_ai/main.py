"""FastAPI 앱. Node 서버가 AI 턴마다 POST /decide 를 호출한다. 상태를 저장하지 않는다."""

from fastapi import FastAPI

from .search import decide
from .models import DecideRequest, DecideResponse

app = FastAPI(title="AstralTab AI", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "astraltab-ai"}


@app.post("/decide", response_model=DecideResponse)
def decide_endpoint(req: DecideRequest) -> DecideResponse:
    action, depth, elapsed_ms = decide(req.state, req.playerId, req.timeLimitMs)
    return DecideResponse(action=action, depth=depth, elapsedMs=elapsed_ms)
