"""Data quality checks, independent of the orchestrator."""

from __future__ import annotations

from dataclasses import dataclass

from . import pipeline, store
from .config import settings

DB = settings.database


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str


class DataQualityError(Exception):
    pass


def require(result: CheckResult) -> CheckResult:
    if not result.passed:
        raise DataQualityError(f"{result.name} failed: {result.detail}")
    return result


def _scalar(sql: str) -> int:
    return int(store.client().query(sql).result_rows[0][0])


# Jev rounds each probability to 2 decimals, so sums of 0.99 or 1.01 are normal.
PROBABILITY_SUM_TOLERANCE = 0.02


def probabilities_sum_to_one() -> CheckResult:
    tol = PROBABILITY_SUM_TOLERANCE
    bad = _scalar(f"""SELECT count() FROM {DB}.jev_answers FINAL
                      WHERE abs(arraySum(mapValues(probabilities)) - 1) > {tol}""")
    return CheckResult("probabilities_sum_to_one", bad == 0, f"{bad} answers off by more than {tol}")


def all_tickets_decided() -> CheckResult:
    pending = len(pipeline.pending_tickets())
    return CheckResult("all_tickets_decided", pending == 0, f"{pending} tickets still pending")


def request_ids_present() -> CheckResult:
    missing = _scalar(f"SELECT count() FROM {DB}.jev_calls WHERE ok AND request_id = ''")
    return CheckResult("request_ids_present", missing == 0, f"{missing} calls without a request id")


def labels_cover_decisions() -> CheckResult:
    unlabeled = _scalar(f"""SELECT count() FROM {DB}.strategy_decisions FINAL
                            WHERE event_id NOT IN (SELECT event_id FROM {DB}.ground_truth)""")
    return CheckResult("labels_cover_decisions", unlabeled == 0, f"{unlabeled} decisions without a label")


ALL = (probabilities_sum_to_one, all_tickets_decided, request_ids_present, labels_cover_decisions)
