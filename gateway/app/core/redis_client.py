"""Redis pub/sub client for telemetry fan-out and caching."""
import asyncio
import json
import logging
from typing import Any, AsyncIterator, Callable

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger("aimp.redis")


class RedisClient:
    def __init__(self) -> None:
        self._client: aioredis.Redis | None = None

    async def connect(self) -> None:
        try:
            self._client = await aioredis.from_url(
                settings.AIMP_REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
            )
            await self._client.ping()
            logger.info("Redis connected: %s", settings.AIMP_REDIS_URL)
        except Exception as exc:
            logger.warning("Redis not available (%s); pub/sub disabled.", exc)
            self._client = None

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()

    @property
    def available(self) -> bool:
        return self._client is not None

    async def publish(self, channel: str, message: dict) -> None:
        if not self._client:
            return
        try:
            await self._client.publish(channel, json.dumps(message))
        except Exception as exc:
            logger.warning("Redis publish error: %s", exc)

    async def set(self, key: str, value: Any, ex: int | None = None) -> None:
        if not self._client:
            return
        try:
            await self._client.set(key, json.dumps(value) if not isinstance(value, str) else value, ex=ex)
        except Exception:
            pass

    async def get(self, key: str) -> Any | None:
        if not self._client:
            return None
        try:
            raw = await self._client.get(key)
            if raw is None:
                return None
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return raw
        except Exception:
            return None

    async def subscribe_channel(self, channel: str) -> AsyncIterator[dict]:
        """Yield messages from a Redis pub/sub channel."""
        if not self._client:
            return
        pubsub = self._client.pubsub()
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        yield json.loads(message["data"])
                    except json.JSONDecodeError:
                        yield {"raw": message["data"]}
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    async def lpush(self, key: str, value: Any) -> None:
        if not self._client:
            return
        await self._client.lpush(key, json.dumps(value))

    async def lrange(self, key: str, start: int = 0, end: int = -1):
        if not self._client:
            return []
        items = await self._client.lrange(key, start, end)
        return [json.loads(i) for i in items]


redis_client = RedisClient()
