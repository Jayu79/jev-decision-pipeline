"""Dagster assets, checks and job.

    dagster dev -m jevpipe.definitions          # UI at http://localhost:3000

Tickets land in ClickHouse on their own (Kafka engine + materialized view).
Dagster owns everything after that: labels, Jev decisions, evaluation.
"""

import os  # no `from __future__ import annotations` here: Dagster reads Config types at runtime

from dagster import (AssetCheckResult, AssetExecutionContext, Config, Definitions,
                     MaterializeResult, MetadataValue, ScheduleDefinition, asset,
                     asset_check, define_asset_job)

from . import calibration, pipeline, report, store
from .config import settings
from .questions import QUESTION_VERSION

DB = settings.database


@asset(group_name="setup", description="Creates ClickHouse tables, the Kafka engine table and its materialized view.")
def clickhouse_schema() -> MaterializeResult:
    store.init_schema(with_kafka=True)
    return MaterializeResult(metadata={"database": DB})


@asset(deps=[clickhouse_schema], group_name="ingest",
       description="Banking77 labels, loaded separately from the ticket stream.")
def ground_truth() -> MaterializeResult:
    n = pipeline.load_ground_truth()
    return MaterializeResult(metadata={"rows": n})


class DecisionConfig(Config):
    limit: int = 0          # 0 = every pending ticket
    batch_size: int = 200


@asset(deps=[clickhouse_schema], group_name="decide",
       description="Asks Jev about every ticket not yet decided for the current questions and model.")
def jev_decisions(context: AssetExecutionContext, config: DecisionConfig) -> MaterializeResult:
    stats = pipeline.run(limit=config.limit or None, batch_size=config.batch_size, log=context.log.info)
    p = calibration.provenance()
    return MaterializeResult(metadata={
        "run_id": stats["run_id"], "decided_now": stats["ok"], "failed_now": stats["failed"],
        "question_version": QUESTION_VERSION, "mock": settings.mock,
        "models_served": ", ".join(p["models_served"]) or "none",
        "total_input_tokens": int(p["input_tokens"] or 0),
    })


@asset(deps=[jev_decisions, ground_truth], group_name="evaluate",
       description="Calibration, routing thresholds and provenance, rendered to HTML.")
def calibration_report() -> MaterializeResult:
    res = calibration.compute()
    path = report.render(res)
    acc = res.summary.set_index("strategy")["accuracy"].to_dict()
    return MaterializeResult(metadata={
        "report": MetadataValue.path(os.path.abspath(path)),
        "verified_jev": res.provenance["verified_jev"],
        **{f"accuracy_{k}": float(v) for k, v in acc.items()},
        **{f"ece_{k}": float(v) for k, v in res.ece.items()},
    })


# ---------------------------------------------------------------------------
# Data quality checks
# ---------------------------------------------------------------------------
@asset_check(asset=jev_decisions, description="Each Choice answer's probabilities sum to 1.")
def probabilities_sum_to_one() -> AssetCheckResult:
    bad = store.client().query(f"""
        SELECT count() FROM {DB}.jev_answers FINAL
        WHERE abs(arraySum(mapValues(probabilities)) - 1) > 0.01
    """).result_rows[0][0]
    return AssetCheckResult(passed=bad == 0, metadata={"violations": int(bad)})


@asset_check(asset=jev_decisions, description="No ticket left undecided after the run.")
def all_tickets_decided() -> AssetCheckResult:
    pending = len(pipeline.pending_tickets())
    return AssetCheckResult(passed=pending == 0, metadata={"pending": pending})


@asset_check(asset=jev_decisions, description="Every successful call carries a TypeSafe request id.")
def request_ids_present() -> AssetCheckResult:
    missing = store.client().query(f"""
        SELECT count() FROM {DB}.jev_calls WHERE ok AND request_id = ''
    """).result_rows[0][0]
    # Warn rather than fail: the header is a convenience, not a contract.
    return AssetCheckResult(passed=missing == 0, metadata={"missing": int(missing)})


@asset_check(asset=ground_truth, description="Every decided ticket has a label.")
def labels_cover_decisions() -> AssetCheckResult:
    unlabeled = store.client().query(f"""
        SELECT count() FROM {DB}.strategy_decisions FINAL
        WHERE event_id NOT IN (SELECT event_id FROM {DB}.ground_truth)
    """).result_rows[0][0]
    return AssetCheckResult(passed=unlabeled == 0, metadata={"unlabeled": int(unlabeled)})


everything = define_asset_job("decide_and_evaluate", selection="*")

defs = Definitions(
    assets=[clickhouse_schema, ground_truth, jev_decisions, calibration_report],
    asset_checks=[probabilities_sum_to_one, all_tickets_decided, request_ids_present, labels_cover_decisions],
    jobs=[everything],
    # Off by default; turn on in the UI to decide new tickets every 10 minutes.
    schedules=[ScheduleDefinition(job=everything, cron_schedule="*/10 * * * *")],
)
