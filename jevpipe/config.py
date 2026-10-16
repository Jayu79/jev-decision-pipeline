"""Runtime settings, read from environment variables (see .env.example)."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    clickhouse_host: str = _env("CLICKHOUSE_HOST", "localhost")
    clickhouse_port: int = int(_env("CLICKHOUSE_PORT", "8123"))
    clickhouse_user: str = _env("CLICKHOUSE_USER", "default")
    clickhouse_password: str = _env("CLICKHOUSE_PASSWORD", "")
    database: str = _env("CLICKHOUSE_DB", "jev")

    kafka_bootstrap: str = _env("KAFKA_BOOTSTRAP", "localhost:19092")
    # Address ClickHouse itself uses to reach Kafka (inside docker-compose).
    kafka_bootstrap_internal: str = _env("KAFKA_BOOTSTRAP_INTERNAL", "redpanda:9092")
    topic: str = _env("TICKETS_TOPIC", "support_tickets")

    jev_model: str = _env("JEV_MODEL", "jev-latest")
    jev_concurrency: int = int(_env("JEV_CONCURRENCY", "16"))
    # Synthetic responses for testing the pipeline without an API key.
    mock: bool = _env("JEV_MOCK", "0") == "1"

    # USD per million tokens. Input is from typesafe.ai ($42 per billion).
    # Confirm both on docs.typesafe.ai/models before quoting costs publicly.
    input_price_per_m: float = float(_env("JEV_INPUT_PRICE_PER_M", "0.042"))
    output_price_per_m: float = float(_env("JEV_OUTPUT_PRICE_PER_M", "0"))

    data_dir: str = _env("DATA_DIR", "data")
    report_path: str = _env("REPORT_PATH", "reports/calibration_report.html")


settings = Settings()
