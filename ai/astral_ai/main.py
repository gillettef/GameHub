"""FastAPI 앱. Node 서버가 AI 차례마다 POST /decide 를 호출한다. 상태를 저장하지 않는다."""

from fastapi import FastAPI

from .models import DecideRequest, DecideResponse
from .search import decide

app = FastAPI(title="Rootbound AI", version="0.3.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rootbound-ai"}


# None 필드(칡 아닌 식물의 direction, 씨앗 없는 seed, 마켓이 빈 차례의 take)는 빼고 보낸다. TS 검증은 undefined 만 "없음"으로 본다
@app.post("/decide", response_model=DecideResponse, response_model_exclude_none=True)
def decide_endpoint(req: DecideRequest) -> DecideResponse:
    action, depth, elapsed_ms = decide(req.state, req.playerId, req.timeLimitMs)
    return DecideResponse(action=action, depth=depth, elapsedMs=elapsed_ms)
