"""Export per-ticket results from ClickHouse as static JSON for the results site.

    python -m jevpipe.export_site_data            # both models, into ./site-data
    python -m jevpipe.export_site_data --out DIR --models jev-1.14.0

Metrics come from jevpipe.calibration (the same queries the reports use), and
fan-out distributions from jevpipe.strategies, so the site can't drift from
the reports. Only ClickHouse is read; nothing from settings or .env is written.
"""

from __future__ import annotations

import argparse
import contextlib
import dataclasses
import json
import math
import os

from . import calibration, store, strategies
from .config import ROOT, settings
from .questions import (FLAT_QUESTION_ID, GROUP_DESCRIPTIONS, INTENT_GROUPS,
                        INTENT_TO_GROUP, QUESTION_VERSION)

DB = settings.database
MODELS = ("jev-1.13.0", "jev-1.14.0")
TOP_K = 5
SOURCE = {"dataset": "Banking77", "author": "PolyAI", "license": "CC-BY-4.0",
          "url": "https://github.com/PolyAI-LDN/task-specific-datasets"}


def _r(v, nd: int = 4):
    """Round for JSON; NaN (e.g. an unreachable cutoff) becomes null."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return round(float(v), nd)


def _write(out: str, name: str, obj) -> None:
    with open(os.path.join(out, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _requested_for(served: str) -> str:
    """The model name the run asked for (jev-1.13.0 was requested as jev-latest)."""
    df = store.query_df(f"""
        SELECT any(model_requested) FROM {DB}.jev_calls
        WHERE ok AND model_served = {{m:String}} AND question_version = {{qv:String}}
    """, m=served, qv=QUESTION_VERSION)
    return str(df.iloc[0, 0]) or served


@contextlib.contextmanager
def _reporting_on(served: str):
    """Point calibration's queries at one served model, as REPORT_MODEL would."""
    saved = calibration.settings
    calibration.settings = dataclasses.replace(
        saved, report_model=served, jev_model=_requested_for(served), mock=False)
    try:
        yield
    finally:
        calibration.settings = saved


# ---------------------------------------------------------------------------
def tickets() -> dict:
    df = store.query_df(f"""
        SELECT t.event_id, t.text, g.label
        FROM {DB}.raw_tickets AS t FINAL
        INNER JOIN {DB}.ground_truth AS g FINAL USING (event_id)
        ORDER BY t.event_id
    """)
    return {"source": SOURCE,
            "columns": ["event_id", "text", "label", "area"],
            "rows": [[e, t, lab, INTENT_TO_GROUP[lab]] for e, t, lab in df.itertuples(index=False)]}


def _answers_by_ticket() -> dict[str, dict[str, dict]]:
    """Raw Jev answers for the current model, shaped like the API response."""
    df = store.query_df(f"""
        SELECT event_id, question_id, probabilities
        FROM {DB}.jev_answers FINAL
        WHERE {calibration._FILTER}
    """, **calibration._params())
    out: dict[str, dict[str, dict]] = {}
    for e, qid, probs in df.itertuples(index=False):
        out.setdefault(e, {})[qid] = {"probabilities": dict(probs)}
    return out


def decisions() -> dict[str, dict]:
    """One table per strategy: the stored decision plus Jev's top-5 intents."""
    dec = store.query_df(f"""
        SELECT d.strategy, d.event_id, d.intent, d.p_intent, d.confidence, d.correct, c.request_id
        FROM {DB}.decision_eval AS d
        INNER JOIN (SELECT event_id, any(request_id) AS request_id FROM {DB}.jev_calls
                    WHERE ok AND {calibration._FILTER} GROUP BY event_id) AS c USING (event_id)
        WHERE {calibration._FILTER}
        ORDER BY d.strategy, d.event_id
    """, **calibration._params())
    answers = _answers_by_ticket()
    distribution = {"flat": lambda a: a[FLAT_QUESTION_ID]["probabilities"],
                    "fanout": strategies.fanout_distribution}
    out = {}
    for strategy, g in dec.groupby("strategy"):
        rows = []
        for r in g.itertuples(index=False):
            top = strategies.ranked(distribution[strategy](answers[r.event_id]))[:TOP_K]
            rows.append([r.event_id, r.intent, _r(r.p_intent), _r(r.confidence), int(r.correct),
                         r.request_id, [[i, _r(p)] for i, p in top]])
        out[strategy] = {"columns": ["event_id", "intent", "p_intent", "confidence", "correct",
                                     "request_id", "top5"],
                         "top5_columns": ["intent", "p"], "rows": rows}
    return out


def summary() -> dict[str, dict]:
    """Per strategy, exactly what the calibration report shows."""
    res = calibration.compute()
    curve = res.curve.drop_duplicates(["strategy", "confidence"])  # RANGE frame: ties share a point
    n_by = res.summary.set_index("strategy")["n"].to_dict()
    out = {}
    for r in res.summary.itertuples():
        s = r.strategy
        rel = res.reliability[res.reliability["strategy"] == s]
        thr = res.thresholds[res.thresholds["strategy"] == s]
        cur = curve[curve["strategy"] == s]
        n = int(n_by[s])
        out[s] = {
            "n": n,
            "n_correct": int(round(r.accuracy * n)),
            "accuracy": float(r.accuracy),
            "mean_stated_confidence": float(r.mean_p),
            "ece": float(res.ece[s]),
            "brier": float(r.brier_top),
            "reliability": [{"bin": int(b.bin), "lo": b.bin / 10, "hi": (b.bin + 1) / 10, "n": int(b.n),
                             "mean_p": float(b.mean_p), "accuracy": float(b.accuracy)}
                            for b in rel.itertuples()],
            "coverage_at": [{"target": float(t.target),
                             "coverage": float(t.coverage),
                             "n_covered": int(round(t.coverage * n)),
                             "cutoff": _r(t.threshold)} for t in thr.itertuples()],
            "coverage_curve": {"columns": ["confidence", "coverage", "accuracy"],
                               "rows": [[_r(c.confidence), _r(c.coverage, 6), _r(c.accuracy, 6)]
                                        for c in cur.itertuples()]},
        }
    return out


def meta(served: str) -> dict:
    p = calibration.provenance()
    return {"model_served": served,
            "model_requested": calibration.settings.jev_model,
            "models_served": p["models_served"],
            "calls_ok": int(p["calls_ok"]), "calls_failed": int(p["calls_failed"]),
            "latency_ms": {"p50": _r(p["p50_ms"], 1), "p95": _r(p["p95_ms"], 1), "p99": _r(p["p99_ms"], 1)},
            "input_tokens": int(p["input_tokens"]), "output_tokens": int(p["output_tokens"]),
            "cost_usd": _r(p["cost_usd"], 6),
            "first_call_utc": str(p["first_call"]), "last_call_utc": str(p["last_call"]),
            "question_version": QUESTION_VERSION,
            "questions_per_call": int(p["questions_per_call"])}


def latencies() -> list[float]:
    df = store.query_df(f"""
        SELECT latency_ms FROM {DB}.jev_calls
        WHERE ok AND {calibration._FILTER} ORDER BY called_at
    """, **calibration._params())
    return [_r(v, 1) for v in df["latency_ms"]]


def export(out: str, models=MODELS) -> list[str]:
    os.makedirs(out, exist_ok=True)
    _write(out, "tickets.json", tickets())
    summaries, metas = {}, {}
    for m in models:
        with _reporting_on(m):
            for strategy, table in decisions().items():
                _write(out, f"decisions_{m}_{strategy}.json", table)
            summaries[m] = summary()
            metas[m] = meta(m)
            _write(out, f"latency_{m}.json", {"model": m, "unit": "ms", "values": latencies()})
    _write(out, "summary.json", summaries)
    _write(out, "meta.json", {
        "models": metas,
        "areas": [{"area": g, "description": GROUP_DESCRIPTIONS[g],
                   "intents": [{"intent": i, "description": d} for i, d in intents.items()]}
                  for g, intents in INTENT_GROUPS.items()],
        "source": SOURCE,
    })
    return sorted(os.listdir(out))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=str(ROOT / "site-data"))
    ap.add_argument("--models", nargs="+", default=list(MODELS))
    args = ap.parse_args()
    for name in export(args.out, args.models):
        print(os.path.join(args.out, name))


if __name__ == "__main__":
    main()
