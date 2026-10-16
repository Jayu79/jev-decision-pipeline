"""Jev decision pipeline, orchestrated by Airflow.

Tickets land in ClickHouse on their own (Kafka engine + materialized view).
This DAG owns everything after that:

    create_schema ─┬─ load_ground_truth ─────────────────────────┐
                   └─ decide_with_jev ─┬─ check_probabilities ───┤
                                       ├─ check_all_decided ─────┼─ build_report
                                       ├─ check_request_ids ─────┤
                                       └─ check_labels ──────────┘

The report only builds if every quality check passes (default all_success).
"""

from __future__ import annotations

import logging
from datetime import datetime

from airflow.sdk import Param, dag, get_current_context, task

log = logging.getLogger(__name__)


@dag(
    dag_id="jev_decision_pipeline",
    description="Classify support tickets with TypeSafe Jev and measure calibration",
    schedule="*/10 * * * *",           # picks up newly streamed tickets
    start_date=datetime(2026, 10, 1),
    catchup=False,
    max_active_runs=1,                 # never two runs deciding the same tickets
    is_paused_upon_creation=True,
    params={
        "limit": Param(0, type="integer", minimum=0, description="0 = every pending ticket"),
        "batch_size": Param(200, type="integer", minimum=1),
    },
    default_args={"retries": 1},
    tags=["jev", "clickhouse", "kafka"],
    doc_md=__doc__,
)
def jev_decision_pipeline():

    @task
    def create_schema() -> None:
        from jevpipe import store
        store.init_schema(with_kafka=True)

    @task
    def load_ground_truth() -> int:
        from jevpipe import pipeline
        return pipeline.load_ground_truth()

    @task(retries=0)  # a retry would re-call Jev; the run is already resumable
    def decide_with_jev() -> dict:
        from jevpipe import calibration, pipeline
        params = get_current_context()["params"]
        stats = pipeline.run(limit=params["limit"] or None,
                             batch_size=params["batch_size"], log=log.info)
        p = calibration.provenance()
        stats["models_served"] = p["models_served"]
        stats["total_input_tokens"] = int(p["input_tokens"] or 0)
        return stats

    # ---- quality gate ------------------------------------------------------
    @task
    def check_probabilities_sum_to_one() -> None:
        from jevpipe import checks
        checks.require(checks.probabilities_sum_to_one())

    @task
    def check_all_tickets_decided() -> None:
        from jevpipe import checks
        result = checks.all_tickets_decided()
        # A capped run (e.g. `make smoke`) leaves tickets pending on purpose: warn, don't fail.
        if get_current_context()["params"]["limit"]:
            if not result.passed:
                log.warning("Capped run: %s", result.detail)
            return
        checks.require(result)

    @task
    def check_request_ids_present() -> None:
        from jevpipe import checks
        # Warn, don't fail: the header is a convenience, not a contract.
        result = checks.request_ids_present()
        if not result.passed:
            log.warning("Request ids missing: %s", result.detail)

    @task
    def check_labels_cover_decisions() -> None:
        from jevpipe import checks
        checks.require(checks.labels_cover_decisions())

    @task
    def build_report() -> dict:
        from jevpipe import calibration, report
        res = calibration.compute()
        path = report.render(res)
        acc = res.summary.set_index("strategy")["accuracy"].to_dict()
        summary = {"report": path, "verified_jev": res.provenance["verified_jev"],
                   **{f"accuracy_{k}": round(float(v), 4) for k, v in acc.items()},
                   **{f"ece_{k}": round(float(v), 4) for k, v in res.ece.items()}}
        log.info("Report: %s", summary)
        return summary

    schema = create_schema()
    labels = load_ground_truth()
    decided = decide_with_jev()
    gate = [check_probabilities_sum_to_one(), check_all_tickets_decided(),
            check_request_ids_present(), check_labels_cover_decisions()]

    schema >> [labels, decided]
    decided >> gate
    labels >> gate[-1]
    [labels, *gate] >> build_report()


jev_decision_pipeline()
