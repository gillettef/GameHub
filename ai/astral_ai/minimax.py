"""
Minimax + 알파베타 탐색. 순수 함수. 입력 상태를 변이하지 않는다.
스캐폴딩 단계: 시간 제한 안에 항상 END_TURN 을 돌려주는 골격만 둔다.
"""

import time

from .models import Action, EndTurnAction, GameState


def decide(state: GameState, player_id: str, time_limit_ms: int) -> tuple[Action, int, int]:
    """(action, depth, elapsed_ms) 를 반환한다. 어떤 경우에도 예외 없이 액션 하나를 돌려준다."""
    started = time.perf_counter()
    action: Action = EndTurnAction(type="END_TURN", playerId=player_id)
    depth = 0
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return action, depth, elapsed_ms
