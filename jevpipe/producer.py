"""Publishes Banking77 messages as ticket events (no labels) to Kafka.

    python -m jevpipe.producer                  # all 3,080 tickets to Kafka
    python -m jevpipe.producer --limit 300      # a sample
    python -m jevpipe.producer --rate 50        # throttle to 50 events/sec
    python -m jevpipe.producer --sink clickhouse   # skip Kafka, write raw_tickets directly
"""

from __future__ import annotations

import argparse
import json
import random
import time
from datetime import datetime, timezone

from . import dataset, store
from .config import settings


def _event(row: dict) -> dict:
    return {
        "event_id": row["event_id"],
        "text": row["text"],
        "source": "banking77",
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
    }


def select(limit: int | None, seed: int = 42) -> list[dict]:
    rows = dataset.load()
    if limit and limit < len(rows):
        rows = random.Random(seed).sample(rows, limit)  # stable random sample across all intents
    return rows


def to_kafka(rows: list[dict], rate: float | None) -> None:
    from confluent_kafka import Producer

    producer = Producer({"bootstrap.servers": settings.kafka_bootstrap,
                         "enable.idempotence": True, "linger.ms": 20})
    for i, row in enumerate(rows, 1):
        event = _event(row)
        producer.produce(settings.topic, key=event["event_id"], value=json.dumps(event))
        producer.poll(0)
        if rate:
            time.sleep(1 / rate)
        if i % 500 == 0:
            print(f"  published {i}/{len(rows)}")
    producer.flush(30)


def to_clickhouse(rows: list[dict]) -> None:
    events = [_event(r) for r in rows]
    for e in events:
        e["created_at"] = datetime.strptime(e["created_at"], "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=timezone.utc)
    store.insert_rows("raw_tickets", events)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--rate", type=float, default=None, help="events per second")
    ap.add_argument("--sink", choices=["kafka", "clickhouse"], default="kafka")
    args = ap.parse_args()

    rows = select(args.limit)
    print(f"Publishing {len(rows)} tickets to {args.sink} ...")
    if args.sink == "kafka":
        to_kafka(rows, args.rate)
    else:
        to_clickhouse(rows)
    print("Done.")


if __name__ == "__main__":
    main()
