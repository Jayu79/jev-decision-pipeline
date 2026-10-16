"""Calls Jev through TypeSafe's official SDK and records proof of every call.

For each ticket we keep what the server returned that our code cannot make up:
the served model version (`response.model`), the `x-typesafe-request-id`
header, and token usage. Totals can be checked against the TypeSafe console.
"""

from __future__ import annotations

import asyncio
import contextvars
import hashlib
import json
import os
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx2
from typesafe_sdk import AsyncTypeSafeClient, TypeSafeError

from .config import settings
from .questions import INTENT_TO_GROUP, build_questions

REQUEST_ID_HEADER = "x-typesafe-request-id"

# Per-call capture slot. Each ticket runs in its own asyncio task, so a
# ContextVar keeps concurrent calls from overwriting each other's headers.
_capture: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar("jev_capture")


class CapturingTransport(httpx2.AsyncBaseTransport):
    """Wraps the real transport and records response headers. Reads nothing
    else, so the SDK parses the response exactly as it normally would."""

    def __init__(self, inner: httpx2.AsyncBaseTransport):
        self._inner = inner

    async def handle_async_request(self, request: httpx2.Request) -> httpx2.Response:
        response = await self._inner.handle_async_request(request)
        slot = _capture.get(None)
        if slot is not None:
            slot["request_id"] = response.headers.get(REQUEST_ID_HEADER, "")
            slot["http_status"] = response.status_code
            slot["attempts"] = slot.get("attempts", 0) + 1
        return response

    async def aclose(self) -> None:
        await self._inner.aclose()


# ---------------------------------------------------------------------------
# Mock server: same response shape as docs.typesafe.ai/api, clearly labelled.
# Exists only so the pipeline can be tested without an API key.
# ---------------------------------------------------------------------------
MOCK_MODEL = "MOCK-not-jev"


def mock_transport(truth: dict[str, str], seed: int = 7) -> httpx2.MockTransport:
    def handler(request: httpx2.Request) -> httpx2.Response:
        raw = request.content
        if request.headers.get("content-encoding") == "zstd":
            try:
                from compression.zstd import decompress  # Python 3.14+
            except ImportError:
                from backports.zstd import decompress
            raw = decompress(raw)
        body = json.loads(raw)
        message = body["state"]["message"]
        label = truth.get(message)
        rng = random.Random(hashlib.sha256(message.encode()).hexdigest() + str(seed))
        answers = {}
        for qid, q in body["questions"].items():
            options = list(q["criteria"])
            # Right option gets extra weight most of the time, so charts aren't empty.
            weights = [rng.random() ** 3 for _ in options]
            if label in options:
                target = label
            elif INTENT_TO_GROUP.get(label) in options:
                target = INTENT_TO_GROUP[label]
            else:
                target = rng.choice(options)
            if rng.random() < 0.85:
                weights[options.index(target)] += rng.uniform(1, 6)
            total = sum(weights)
            probs = {o: w / total for o, w in zip(options, weights)}
            top = max(probs, key=probs.get)
            n = len(options)
            answers[qid] = {
                "type": "choice",
                "choice": top,
                "probabilities": probs,
                "confidence": (probs[top] - 1 / n) / (1 - 1 / n),
            }
        return httpx2.Response(
            200,
            json={"model": MOCK_MODEL, "answers": answers,
                  "usage": {"input_tokens": 900 + len(message), "output_tokens": 40}},
            headers={REQUEST_ID_HEADER: "mock-" + uuid.uuid4().hex[:16]},
        )

    return httpx2.MockTransport(handler)


@dataclass
class CallResult:
    event_id: str
    ok: bool
    model_served: str = ""
    request_id: str = ""
    latency_ms: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    attempts: int = 0
    answers: dict[str, dict[str, Any]] = field(default_factory=dict)
    error: str = ""


async def _decide_one(client: AsyncTypeSafeClient, sem: asyncio.Semaphore,
                      event_id: str, text: str, questions) -> CallResult:
    async with sem:
        slot: dict[str, Any] = {}
        _capture.set(slot)
        start = time.perf_counter()
        try:
            response = await client.system_one(state={"message": text}, questions=questions)
        except TypeSafeError as exc:
            return CallResult(event_id, ok=False, error=f"{type(exc).__name__}: {exc}"[:500],
                              request_id=slot.get("request_id", ""), attempts=slot.get("attempts", 0))
        latency = (time.perf_counter() - start) * 1000
        return CallResult(
            event_id=event_id,
            ok=True,
            model_served=response.model,
            request_id=slot.get("request_id", ""),
            latency_ms=latency,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            attempts=slot.get("attempts", 1),
            answers={qid: a.model_dump() for qid, a in response.answers.items()},
        )


async def decide_tickets(tickets: list[tuple[str, str]], *, mock: bool | None = None,
                         truth: dict[str, str] | None = None) -> list[CallResult]:
    """tickets: (event_id, text) pairs. Returns one CallResult per ticket."""
    mock = settings.mock if mock is None else mock
    if not mock and not os.environ.get("TYPESAFE_API_KEY"):
        raise RuntimeError("TYPESAFE_API_KEY is not set. Add it to .env, or set JEV_MOCK=1 to test without one.")
    inner = mock_transport(truth or {}) if mock else httpx2.AsyncHTTPTransport()
    client_kwargs: dict[str, Any] = {"model": settings.jev_model,
                                     "transport": CapturingTransport(inner)}
    if mock:
        client_kwargs["api_key"] = "mock-key"
    questions = build_questions()
    sem = asyncio.Semaphore(settings.jev_concurrency)
    async with AsyncTypeSafeClient(**client_kwargs) as client:
        return await asyncio.gather(*[
            _decide_one(client, sem, eid, text, questions) for eid, text in tickets
        ])
