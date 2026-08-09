"""Selenyx 本地 agent 服务（loop/harness + subagent）。

轻量实现：纯 asyncio，无第三方 agent 框架；BYOK 经本机 LLM 网关设置。
"""

from selenyx_backend.services.agent import registry
from selenyx_backend.services.agent.loop import execute_run

__all__ = ["execute_run", "registry"]
