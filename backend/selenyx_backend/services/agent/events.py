"""run 事件总线（V4 模块 D）：SSE 订阅的进程内广播。

单进程 sidecar 语义：execute_run 的每条时间线事件经 ``publish`` 广播给
该 run 的所有订阅者（每订阅者一个独立 asyncio.Queue，互不拖累）。
进程重启后订阅者随连接断开自然清空，无需持久化。

事件结构沿用时间线条目：``{"type": "step"|"status", ...}``——
SSE 路由层负责把 kind 映射为 go-claw 风格事件名（tool→tool_call 等）。
"""

from __future__ import annotations

import asyncio
from typing import Any

# 单订阅者队列上限：慢消费者溢出时丢最旧事件（保最新），防内存膨胀
_MAX_QUEUE = 200

_SUBSCRIBERS: dict[str, set[asyncio.Queue]] = {}


def subscribe(run_id: str) -> asyncio.Queue:
    """订阅一个 run 的事件流，返回独立队列；用 unsubscribe 清理。"""
    queue: asyncio.Queue = asyncio.Queue(maxsize=_MAX_QUEUE)
    _SUBSCRIBERS.setdefault(run_id, set()).add(queue)
    return queue


def unsubscribe(run_id: str, queue: asyncio.Queue) -> None:
    peers = _SUBSCRIBERS.get(run_id)
    if not peers:
        return
    peers.discard(queue)
    if not peers:
        _SUBSCRIBERS.pop(run_id, None)


def publish(run_id: str, event: dict[str, Any]) -> None:
    """广播事件给该 run 全部订阅者；队列满则丢最旧保最新。"""
    for queue in list(_SUBSCRIBERS.get(run_id, ())):
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass


def subscriber_count(run_id: str) -> int:
    return len(_SUBSCRIBERS.get(run_id, ()))


__all__ = ["subscribe", "unsubscribe", "publish", "subscriber_count"]
