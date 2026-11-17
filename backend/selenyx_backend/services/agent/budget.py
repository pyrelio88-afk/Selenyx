"""Per-run LLM token budget. 0 = unlimited (default, backward compatible)."""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass


class TokenBudgetExceeded(Exception):
    def __init__(self, used: int, limit: int) -> None:
        self.used = used
        self.limit = limit
        super().__init__(f"token budget exceeded: {used} > {limit}")


@dataclass
class _BudgetState:
    limit: int
    used: int = 0


_budget_state: ContextVar[_BudgetState | None] = ContextVar(
    "selenyx_token_budget_state", default=None
)


def start_budget(limit: int) -> None:
    _budget_state.set(_BudgetState(limit=max(0, int(limit or 0)), used=0))


def tokens_used() -> int:
    state = _budget_state.get()
    return state.used if state is not None else 0


def token_limit() -> int:
    state = _budget_state.get()
    return state.limit if state is not None else 0


def record_usage(n: int) -> int:
    """Accumulate tokens on shared mutable state across child asyncio Tasks."""
    state = _budget_state.get()
    if state is None:
        return 0
    state.used += max(0, int(n))
    if state.limit and state.used > state.limit:
        raise TokenBudgetExceeded(state.used, state.limit)
    return state.used


def estimate_tokens(messages: list[dict[str, str]], completion: str = "") -> int:
    chars = sum(len(str(m.get("content", ""))) for m in messages) + len(completion)
    return max(1, chars // 4)
