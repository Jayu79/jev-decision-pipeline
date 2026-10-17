"""Batch runner: decide pending tickets with Jev and land the results."""

from __future__ import annotations

import asyncio
import json
import os
import uuid

from . import dataset, store
from .config import settings
from .jev import decide_tickets
from .questions import QUESTION_VERSION, build_questions
from .strategies import STRATEGIES

DB = settings.database
EVIDENCE_SAMPLE_SIZE = 25


def pending_tickets(limit: int | None = None) -> list[tuple[str, str]]:
    """Tickets with no successful call for the current questions, model and mode."""
    df = store.query_df(
        f"""
        SELECT event_id, text
        FROM {DB}.raw_tickets FINAL
        WHERE event_id NOT IN (
            SELECT event_id FROM {DB}.jev_calls
            WHERE ok = 1
              AND question_version = {{qv:String}}
              AND model_requested = {{model:String}}
              AND is_mock = {{mock:UInt8}}
        )
        ORDER BY event_id
        {"LIMIT " + str(int(limit)) if limit else ""}
        """,
        qv=QUESTION_VERSION, model=settings.jev_model, mock=int(settings.mock),
    )
    return list(df.itertuples(index=False, name=None))


def evidence_path() -> str:
    """One sample file per requested model, so a new run never appends to an old one."""
    if settings.mock:
        name = "mock_responses_sample.jsonl"
    elif settings.jev_model == "jev-latest":
        name = "jev_responses_sample.jsonl"
    else:
        name = f"{settings.jev_model}_responses_sample.jsonl"
    return os.path.join(settings.evidence_dir, name)


def _save_evidence(results) -> None:
    """Keep a small sample of untouched API responses as committed proof."""
    path = evidence_path()
    os.makedirs(settings.evidence_dir, exist_ok=True)
    have = sum(1 for _ in open(path)) if os.path.exists(path) else 0
    with open(path, "a") as f:
        for r in results:
            if have >= EVIDENCE_SAMPLE_SIZE:
                break
            if r.ok:
                f.write(json.dumps({
                    "event_id": r.event_id, "request_id": r.request_id,
                    "model": r.model_served, "latency_ms": round(r.latency_ms, 1),
                    "usage": {"input_tokens": r.input_tokens, "output_tokens": r.output_tokens},
                    "answers": r.answers,
                }) + "\n")
                have += 1


def run(limit: int | None = None, batch_size: int = 200, log=print) -> dict:
    tickets = pending_tickets(limit)
    run_id = uuid.uuid4().hex[:12]
    truth = {r["text"]: r["label"] for r in dataset.load()} if settings.mock else None
    n_questions = len(build_questions())
    stats = {"run_id": run_id, "pending": len(tickets), "ok": 0, "failed": 0}
    log(f"run {run_id}: {len(tickets)} tickets pending (mock={settings.mock})")

    for start in range(0, len(tickets), batch_size):
        batch = tickets[start:start + batch_size]
        results = asyncio.run(decide_tickets(batch, truth=truth))
        calls, answers, decisions = [], [], []
        for r in results:
            common = {"run_id": run_id, "event_id": r.event_id,
                      "question_version": QUESTION_VERSION,
                      "model_requested": settings.jev_model,
                      "model_served": r.model_served, "request_id": r.request_id,
                      "is_mock": int(settings.mock)}
            calls.append({**common, "ok": int(r.ok), "error": r.error,
                          "latency_ms": r.latency_ms, "input_tokens": r.input_tokens,
                          "output_tokens": r.output_tokens, "attempts": r.attempts,
                          "n_questions": n_questions})
            if not r.ok:
                stats["failed"] += 1
                continue
            stats["ok"] += 1
            for qid, a in r.answers.items():
                answers.append({**common, "question_id": qid, "choice": a["choice"],
                                "confidence": float(a["confidence"]),
                                "probabilities": {k: float(v) for k, v in a["probabilities"].items()}})
            for strategy in STRATEGIES:
                d = strategy(r.answers)
                decisions.append({"event_id": r.event_id, "question_version": QUESTION_VERSION,
                                  "model_served": r.model_served, "is_mock": int(settings.mock), **d})
        store.insert_rows("jev_calls", calls)
        store.insert_rows("jev_answers", answers)
        store.insert_rows("strategy_decisions", decisions)
        _save_evidence(results)
        log(f"  {min(start + batch_size, len(tickets))}/{len(tickets)} done "
            f"(ok={stats['ok']}, failed={stats['failed']})")
    return stats


def load_ground_truth() -> int:
    return store.insert_rows("ground_truth",
                             [{"event_id": r["event_id"], "label": r["label"]} for r in dataset.load()])
