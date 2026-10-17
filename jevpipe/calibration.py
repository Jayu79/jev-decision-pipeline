"""Calibration and routing metrics, computed in ClickHouse.

Calibration asks: when Jev says p = 0.8 for its pick, is it right ~80% of the
time? Routing asks: if we only auto-handle tickets above a confidence
threshold, what share do we cover, and at what accuracy?
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from . import store
from .config import settings
from .questions import ACCURACY_TARGETS, CALIBRATION_BINS, QUESTION_VERSION

DB = settings.database
# Every metric is for one served model version, so two Jev releases never
# blend into one number.
_FILTER = ("question_version = {qv:String} AND is_mock = {mock:UInt8} "
           "AND model_served = {model:String}")


def report_model() -> str:
    """REPORT_MODEL if set, else the version TypeSafe last served for JEV_MODEL."""
    if settings.report_model:
        return settings.report_model
    df = store.query_df(f"""
        SELECT model_served FROM {DB}.jev_calls
        WHERE ok AND model_requested = {{requested:String}} AND is_mock = {{mock:UInt8}}
        ORDER BY called_at DESC LIMIT 1
    """, requested=settings.jev_model, mock=int(settings.mock))
    return str(df.iloc[0, 0]) if not df.empty else settings.jev_model


def _params() -> dict:
    return {"qv": QUESTION_VERSION, "mock": int(settings.mock), "model": report_model()}


def summary() -> pd.DataFrame:
    """Per strategy: n, accuracy, mean stated probability, Brier-style gap."""
    return store.query_df(f"""
        SELECT strategy,
               count()                        AS n,
               avg(correct)                   AS accuracy,
               avg(p_intent)                  AS mean_p,
               avg(pow(p_intent - correct, 2)) AS brier_top
        FROM {DB}.decision_eval
        WHERE {_FILTER}
        GROUP BY strategy ORDER BY strategy
    """, **_params())


def reliability() -> pd.DataFrame:
    """Equal-width bins on the stated probability of the chosen intent."""
    return store.query_df(f"""
        SELECT strategy,
               least(toUInt8(floor(p_intent * {CALIBRATION_BINS})), {CALIBRATION_BINS - 1}) AS bin,
               count()        AS n,
               avg(p_intent)  AS mean_p,
               avg(correct)   AS accuracy
        FROM {DB}.decision_eval
        WHERE {_FILTER}
        GROUP BY strategy, bin ORDER BY strategy, bin
    """, **_params())


def ece(rel: pd.DataFrame) -> dict[str, float]:
    """Expected calibration error: weighted mean |accuracy - confidence| over bins."""
    out = {}
    for strategy, g in rel.groupby("strategy"):
        out[strategy] = float((g["n"] * (g["accuracy"] - g["mean_p"]).abs()).sum() / g["n"].sum())
    return out


def coverage_curve() -> pd.DataFrame:
    """Sort by confidence; cumulative accuracy vs share of tickets covered."""
    return store.query_df(f"""
        SELECT strategy, confidence,
               row_number() OVER w / count() OVER (PARTITION BY strategy) AS coverage,
               sum(correct) OVER w / row_number() OVER w                   AS accuracy
        FROM {DB}.decision_eval
        WHERE {_FILTER}
        WINDOW w AS (PARTITION BY strategy ORDER BY confidence DESC
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        ORDER BY strategy, coverage
    """, **_params())


def thresholds(curve: pd.DataFrame) -> pd.DataFrame:
    """For each accuracy target, the largest share Jev can auto-handle and the
    confidence threshold that achieves it."""
    rows = []
    for strategy, g in curve.groupby("strategy"):
        for target in ACCURACY_TARGETS:
            ok = g[g["accuracy"] >= target]
            if ok.empty:
                rows.append({"strategy": strategy, "target": target, "coverage": 0.0, "threshold": None})
            else:
                best = ok.loc[ok["coverage"].idxmax()]
                rows.append({"strategy": strategy, "target": target,
                             "coverage": float(best["coverage"]), "threshold": float(best["confidence"])})
    return pd.DataFrame(rows)


def confusions(limit: int = 10) -> pd.DataFrame:
    return store.query_df(f"""
        SELECT strategy, label AS actual, intent AS predicted, count() AS n,
               avg(p_intent) AS mean_p
        FROM {DB}.decision_eval
        WHERE {_FILTER} AND NOT correct
        GROUP BY strategy, actual, predicted
        ORDER BY n DESC LIMIT {int(limit)}
    """, **_params())


def provenance() -> dict:
    """Facts that show these numbers came from TypeSafe's API."""
    df = store.query_df(f"""
        SELECT
            countIf(ok)                                  AS calls_ok,
            countIf(NOT ok)                              AS calls_failed,
            groupUniqArrayIf(model_served, ok)           AS models_served,
            countIf(ok AND request_id != '')             AS with_request_id,
            sumIf(input_tokens, ok)                      AS input_tokens,
            sumIf(output_tokens, ok)                     AS output_tokens,
            quantileIf(0.5)(latency_ms, ok)              AS p50_ms,
            quantileIf(0.95)(latency_ms, ok)             AS p95_ms,
            quantileIf(0.99)(latency_ms, ok)             AS p99_ms,
            sumIf(attempts - 1, ok AND attempts > 1)     AS retries,
            any(n_questions)                             AS questions_per_call,
            min(called_at)                               AS first_call,
            max(called_at)                               AS last_call,
            groupUniqArray(run_id)                       AS run_ids,
            max(is_mock)                                 AS any_mock
        FROM {DB}.jev_calls
        WHERE question_version = {{qv:String}} AND is_mock = {{mock:UInt8}}
          -- failed calls have no served model; count them against the request
          AND (model_served = {{model:String}}
               OR (NOT ok AND model_requested = {{requested:String}}))
    """, **_params(), requested=settings.jev_model)
    p = df.iloc[0].to_dict()
    p["models_served"] = sorted(p["models_served"])
    p["cost_usd"] = (p["input_tokens"] * settings.input_price_per_m
                     + p["output_tokens"] * settings.output_price_per_m) / 1e6
    p["verified_jev"] = bool(
        p["calls_ok"] > 0 and not p["any_mock"]
        and all(m.lower().startswith("jev") for m in p["models_served"])
    )
    return p


@dataclass
class Results:
    summary: pd.DataFrame
    reliability: pd.DataFrame
    ece: dict
    curve: pd.DataFrame
    thresholds: pd.DataFrame
    confusions: pd.DataFrame
    provenance: dict


def compute() -> Results:
    if summary().empty:
        raise ValueError(
            f"No labelled decisions for question version {QUESTION_VERSION} "
            f"(model={report_model()}, mock={settings.mock}). Stream tickets first (`make produce`), "
            "then materialize jev_decisions."
        )
    rel = reliability()
    curve = coverage_curve()
    return Results(summary(), rel, ece(rel), curve, thresholds(curve), confusions(), provenance())
