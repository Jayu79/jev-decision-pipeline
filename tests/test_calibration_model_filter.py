"""jev-1.13.0 and jev-1.14.0 rows must never blend into one metric.

The first test needs nothing running. The second loads both models into a
scratch ClickHouse database and is skipped when ClickHouse isn't reachable.
"""

import dataclasses
import uuid

import pandas as pd
import pytest

from jevpipe import calibration, store
from jevpipe.questions import QUESTION_VERSION

V13, V14 = "jev-1.13.0", "jev-1.14.0"


def _use_model(monkeypatch, model):
    monkeypatch.setattr(calibration, "settings",
                        dataclasses.replace(calibration.settings, report_model=model, mock=False))


@pytest.mark.parametrize("model", [V13, V14])
def test_every_metric_query_binds_the_report_model(monkeypatch, model):
    _use_model(monkeypatch, model)
    seen = []

    def fake_query_df(sql, **params):
        seen.append((sql, params))
        return pd.DataFrame([{"models_served": [model], "input_tokens": 0, "output_tokens": 0,
                              "calls_ok": 0, "any_mock": 0}])

    monkeypatch.setattr(store, "query_df", fake_query_df)
    for fn in (calibration.summary, calibration.reliability, calibration.coverage_curve,
               calibration.confusions, calibration.provenance):
        fn()
    assert len(seen) == 5
    for sql, params in seen:
        assert "model_served = {model:String}" in sql
        assert params["model"] == model


def test_report_model_defaults_to_what_jev_model_was_served_as(monkeypatch):
    monkeypatch.setattr(calibration, "settings",
                        dataclasses.replace(calibration.settings, report_model="", jev_model="jev-latest"))
    monkeypatch.setattr(store, "query_df", lambda sql, **p: pd.DataFrame({"model_served": [V13]}))
    assert calibration.report_model() == V13


# ---------------------------------------------------------------------------
# Against a real ClickHouse: same tickets, two models, opposite answers.
# ---------------------------------------------------------------------------
@pytest.fixture
def scratch_db(monkeypatch):
    try:
        store.client().command("SELECT 1")
    except Exception:
        pytest.skip("ClickHouse not reachable")
    db = f"jev_test_{uuid.uuid4().hex[:8]}"
    ch = store.client()
    ch.command(f"CREATE DATABASE {db}")
    for stmt in store.CORE_DDL[1:]:  # [0] creates the real database
        ch.command(stmt.replace(f"{store.DB}.", f"{db}."))
    monkeypatch.setattr(calibration, "DB", db)
    yield db
    ch.command(f"DROP DATABASE IF EXISTS {db}")


def test_metrics_for_one_model_ignore_the_other(scratch_db, monkeypatch):
    ch = store.client()
    events = [f"e{i}" for i in range(10)]
    ch.insert(f"{scratch_db}.ground_truth", [[e, "card_arrival"] for e in events],
              column_names=["event_id", "label"])
    rows = []
    for model, intent, p in ((V13, "card_arrival", 0.9), (V14, "pin_blocked", 0.6)):
        for e in events:
            for strategy in ("flat", "fanout"):
                rows.append([e, strategy, QUESTION_VERSION, model, intent, p, 0.05, p, 0])
        ch.insert(f"{scratch_db}.jev_calls",
                  [["r", e, QUESTION_VERSION, model, model, "req", 1, "", 100.0, 1000, 10, 1, 11, 0]
                   for e in events],
                  column_names=["run_id", "event_id", "question_version", "model_requested",
                                "model_served", "request_id", "ok", "error", "latency_ms",
                                "input_tokens", "output_tokens", "attempts", "n_questions", "is_mock"])
    ch.insert(f"{scratch_db}.strategy_decisions", rows,
              column_names=["event_id", "strategy", "question_version", "model_served", "intent",
                            "p_intent", "p_second", "confidence", "is_mock"])

    _use_model(monkeypatch, V13)
    s13 = calibration.summary().set_index("strategy")
    assert list(s13["n"]) == [10, 10] and (s13["accuracy"] == 1.0).all()
    assert calibration.confusions().empty
    p13 = calibration.provenance()
    assert int(p13["calls_ok"]) == 10 and p13["models_served"] == [V13]

    _use_model(monkeypatch, V14)
    s14 = calibration.summary().set_index("strategy")
    assert list(s14["n"]) == [10, 10] and (s14["accuracy"] == 0.0).all()
    assert len(calibration.coverage_curve()) == 20
    assert set(calibration.reliability()["bin"]) == {6}
    assert calibration.provenance()["models_served"] == [V14]


def test_coverage_threshold_never_splits_tied_confidences(scratch_db, monkeypatch):
    # Two right at 1.0, then four tied at 0.9 with only one right. Cutting
    # through the tie could report 50% coverage at 100% accuracy; no
    # threshold actually gives that.
    ch = store.client()
    tickets = [("a", 1.0, True), ("b", 1.0, True),
               ("c", 0.9, True), ("d", 0.9, False), ("e", 0.9, False), ("f", 0.9, False)]
    ch.insert(f"{scratch_db}.ground_truth", [[e, "card_arrival"] for e, _, _ in tickets],
              column_names=["event_id", "label"])
    ch.insert(f"{scratch_db}.strategy_decisions",
              [[e, "flat", QUESTION_VERSION, V13, "card_arrival" if ok else "pin_blocked", c, 0.0, c, 0]
               for e, c, ok in tickets],
              column_names=["event_id", "strategy", "question_version", "model_served", "intent",
                            "p_intent", "p_second", "confidence", "is_mock"])
    _use_model(monkeypatch, V13)
    thr = calibration.thresholds(calibration.coverage_curve()).set_index("target")
    assert thr.loc[0.95, "coverage"] == pytest.approx(2 / 6)
    assert thr.loc[0.95, "threshold"] == pytest.approx(1.0)
