"""ClickHouse schema and read/write helpers."""

from __future__ import annotations

import json
from collections.abc import Iterable

import clickhouse_connect

from .config import settings

DB = settings.database

# Core tables. Raw tickets arrive from Kafka at-least-once, so tables are
# ReplacingMergeTree keyed on the natural id; duplicates collapse on merge
# and every analytical read uses FINAL.
CORE_DDL = [
    f"CREATE DATABASE IF NOT EXISTS {DB}",
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.raw_tickets (
        event_id     String,
        text         String,
        source       LowCardinality(String),
        created_at   DateTime64(3, 'UTC'),
        ingested_at  DateTime64(3, 'UTC') DEFAULT now64(3)
    ) ENGINE = ReplacingMergeTree(ingested_at)
    ORDER BY event_id
    """,
    # Labels come from a separate source, as they would in production
    # (e.g. the agent's final resolution), never through the ticket stream.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.ground_truth (
        event_id   String,
        label      LowCardinality(String),
        loaded_at  DateTime64(3, 'UTC') DEFAULT now64(3)
    ) ENGINE = ReplacingMergeTree(loaded_at)
    ORDER BY event_id
    """,
    # One row per (ticket, question). Raw Jev answer plus proof of the call.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.jev_answers (
        run_id            String,
        event_id          String,
        question_id       LowCardinality(String),
        question_version  LowCardinality(String),
        model_requested   LowCardinality(String),
        model_served      LowCardinality(String),
        request_id        String,
        choice            LowCardinality(String),
        confidence        Float32,
        probabilities     Map(String, Float32),
        is_mock           UInt8,
        decided_at        DateTime64(3, 'UTC') DEFAULT now64(3)
    ) ENGINE = ReplacingMergeTree(decided_at)
    ORDER BY (question_version, model_served, question_id, event_id)
    """,
    # One row per API call: latency, tokens, retries. This is the table you
    # reconcile against the TypeSafe console's usage page.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.jev_calls (
        run_id            String,
        event_id          String,
        question_version  LowCardinality(String),
        model_requested   LowCardinality(String),
        model_served      LowCardinality(String),
        request_id        String,
        ok                UInt8,
        error             String,
        latency_ms        Float32,
        input_tokens      UInt32,
        output_tokens     UInt32,
        attempts          UInt8,
        n_questions       UInt8,
        is_mock           UInt8,
        called_at         DateTime64(3, 'UTC') DEFAULT now64(3)
    ) ENGINE = MergeTree
    ORDER BY (called_at, event_id)
    """,
    # Final intent per strategy, composed in code from jev_answers.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.strategy_decisions (
        event_id          String,
        strategy          LowCardinality(String),
        question_version  LowCardinality(String),
        model_served      LowCardinality(String),
        intent            LowCardinality(String),
        p_intent          Float32,
        p_second          Float32,
        confidence        Float32,
        is_mock           UInt8,
        computed_at       DateTime64(3, 'UTC') DEFAULT now64(3)
    ) ENGINE = ReplacingMergeTree(computed_at)
    ORDER BY (question_version, model_served, strategy, event_id)
    """,
    # Evaluation view: every decision joined to its label.
    f"""
    CREATE OR REPLACE VIEW {DB}.decision_eval AS
    SELECT
        s.event_id, s.strategy, s.question_version, s.model_served, s.is_mock,
        s.intent, s.p_intent, s.p_second, s.confidence,
        g.label,
        s.intent = g.label AS correct
    FROM {DB}.strategy_decisions AS s FINAL
    INNER JOIN {DB}.ground_truth AS g FINAL USING (event_id)
    """,
]


def kafka_ddl() -> list[str]:
    """ClickHouse pulls the topic itself: Kafka engine table + materialized view."""
    return [
        f"""
        CREATE TABLE IF NOT EXISTS {DB}.tickets_queue (
            event_id    String,
            text        String,
            source      String,
            created_at  DateTime64(3, 'UTC')
        ) ENGINE = Kafka
        SETTINGS kafka_broker_list = '{settings.kafka_bootstrap_internal}',
                 kafka_topic_list = '{settings.topic}',
                 kafka_group_name = 'clickhouse_raw_tickets',
                 kafka_format = 'JSONEachRow',
                 kafka_num_consumers = 1,
                 kafka_skip_broken_messages = 10
        """,
        f"""
        CREATE MATERIALIZED VIEW IF NOT EXISTS {DB}.tickets_mv TO {DB}.raw_tickets AS
        SELECT event_id, text, source, created_at FROM {DB}.tickets_queue
        """,
    ]


def client():
    return clickhouse_connect.get_client(
        host=settings.clickhouse_host, port=settings.clickhouse_port,
        username=settings.clickhouse_user, password=settings.clickhouse_password,
    )


def init_schema(with_kafka: bool = True) -> None:
    ch = client()
    for stmt in CORE_DDL + (kafka_ddl() if with_kafka else []):
        ch.command(stmt)


def insert_rows(table: str, rows: Iterable[dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    cols = list(rows[0])
    client().insert(f"{DB}.{table}", [[r[c] for c in cols] for r in rows], column_names=cols)
    return len(rows)


def query_df(sql: str, **params):
    return client().query_df(sql, parameters=params)


def to_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, default=str)
