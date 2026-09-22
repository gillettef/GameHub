"""
행동 결정 (Phase 3 에서 2인 알파베타 Minimax / 3~4인 max-n 으로 교체한다).
현재는 1수 탐욕: 합법 수 각각을 rules.apply_action 으로 적용해 본 뒤 점수 차가 가장 큰 수를 고른다.
순수 함수. 입력 상태를 변이하지 않는다. 어떤 경우에도 시간 제한 안에 액션 하나를 돌려준다.
"""

from __future__ import annotations

import time

from .models import Action, GameState, PassAction
from .rules import apply_action, compute_scores, legal_actions


def evaluate(state: GameState, player_id: str) -> float:
    """내 점수 − 최고 상대 점수. 탈락은 큰 음수."""
    me = next(p for p in state.players if p.id == player_id)
    if not me.alive:
        return -10_000.0
    scores = compute_scores(state)
    others = [s.total for pid, s in scores.items() if pid != player_id]
    return float(scores[player_id].total - (max(others) if others else 0))


def decide(state: GameState, player_id: str, time_limit_ms: int) -> tuple[Action, int, int]:
    """(action, depth, elapsed_ms). 시간이 모자라면 지금까지 본 것 중 최선, 없으면 PASS."""
    started = time.perf_counter()
    deadline = started + time_limit_ms / 1000 * 0.8
    fallback: Action = PassAction(type="PASS", playerId=player_id)
    best: Action = fallback
    best_value = float("-inf")
    depth = 0
    for action in legal_actions(state, player_id):
        if time.perf_counter() > deadline:
            break
        try:
            value = evaluate(apply_action(state, action), player_id)
        except ValueError:
            continue
        depth = 1
        if value > best_value:
            best_value, best = value, action
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return best, depth, elapsed_ms
