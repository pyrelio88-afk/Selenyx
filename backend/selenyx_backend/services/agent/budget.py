"""Per-run LLM token budget. 0 = unlimited (default, backward compatible)."""

from __future__ import annotations

from contextvars import ContextVar


class TokenBudgetExceeded(Exception):
    def __init__(self, used: int, limit: int) -> None:
        self.used = used
        self.limit = limit
        super().__init__(f"token budget exceeded: {used} > {limit}")


_started: ContextVar[bool] = ContextVar("selenyx_token_budget_started", default=False)
_used: ContextVar[int] = ContextVar("selenyx_token_budget_used", default=0)
_limit: ContextVar[int] = ContextVar("selenyx_token_budget_limit", default=0)


def start_budget(limit: int) -> None:
    _started.set(True)
    _used.set(0)
    _limit.set(max(0, int(limit or 0)))


def tokens_used() -> int:
    return _used.get()


def token_limit() -> int:
    return _limit.get()


def record_usage(n: int) -> int:
    """Accumulate tokens. No-op until start_budget() so isolated tests stay quiet."""
    if not _started.get():
        return 0
    used = _used.get() + max(0, int(n))
    _used.set(used)
    limit = _limit.get()
    if limit and used > limit:
        raise TokenBudgetExceeded(used, limit)
    return used


def estimate_tokens(messages: list[dict[str, str]], completion: str = "") -> int:
    chars = sum(len(str(m.get("content", ""))) for m in messages) + len(completion)
    return max(1, chars // 4)
