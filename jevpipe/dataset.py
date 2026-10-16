"""Banking77 (PolyAI, CC-BY-4.0): real customer messages to a digital bank,
each labelled with one of 77 intents. We use the 3,080-message test split."""

from __future__ import annotations

import csv
import hashlib
import os
import urllib.request

from .config import settings

URL = "https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/master/banking_data/test.csv"


def path() -> str:
    return os.path.join(settings.data_dir, "banking77_test.csv")


def download() -> str:
    p = path()
    if not os.path.exists(p):
        os.makedirs(settings.data_dir, exist_ok=True)
        urllib.request.urlretrieve(URL, p)
    return p


def event_id(row_index: int, text: str) -> str:
    # Stable across reruns, so re-producing the stream is idempotent downstream.
    return hashlib.sha256(f"b77-test:{row_index}:{text}".encode()).hexdigest()[:20]


def load() -> list[dict]:
    """Rows as {event_id, text, label}."""
    with open(download(), newline="", encoding="utf-8") as f:
        return [
            {"event_id": event_id(i, r["text"]), "text": r["text"], "label": r["category"]}
            for i, r in enumerate(csv.DictReader(f))
        ]
