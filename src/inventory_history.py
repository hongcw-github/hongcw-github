"""Durable daily observations, separate from overwriteable dashboard caches."""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import firestore_cache

TIMEZONES = {"CA": "America/Toronto", "US": "America/Los_Angeles", "MX": "America/Mexico_City",
             "UK": "Europe/London", "GB": "Europe/London", "DE": "Europe/Berlin", "JP": "Asia/Tokyo"}
QUANTITIES = ("fulfillable_quantity", "reserved_quantity", "inbound_quantity", "total_quantity")


def build_snapshot(rows: list[dict], marketplace: str, collected_at: float,
                   quantity_fields: list[str] | None = None) -> dict:
    tz = TIMEZONES.get(marketplace, "UTC")
    instant = datetime.fromtimestamp(collected_at, timezone.utc)
    reported = set(QUANTITIES if quantity_fields is None else quantity_fields)
    grouped: dict[str, dict] = {}
    for row in rows:
        sku = str(row.get("sku") or "").strip()
        if not sku:
            raise ValueError("Inventory row has no SKU")
        item = grouped.setdefault(sku, {"sku": sku, "product_name": str(row.get("product_name") or sku),
                                       **{key: 0 if key in reported else None for key in QUANTITIES}})
        for key in QUANTITIES:
            if key not in reported:
                continue
            value = float(row.get(key, 0))
            if not math.isfinite(value) or value < 0 or not value.is_integer():
                raise ValueError(f"Invalid inventory quantity: {key}")
            item[key] += int(value)
    return {"date": instant.astimezone(ZoneInfo(tz)).date().isoformat(),
            "marketplace": marketplace, "timezone": tz,
            "collected_at": instant.isoformat(), "source": "sp_api_inventory_snapshot",
            "items": sorted(grouped.values(), key=lambda item: item["sku"]),
            "quantity_fields": sorted(reported),
            "totals": {key: sum(item[key] for item in grouped.values()) if key in reported else None
                       for key in QUANTITIES}}


def _days(db, marketplace: str):
    return db.collection("inventory_daily").document(marketplace).collection("days")


def save_snapshot(snapshot: dict) -> bool:
    """Keep the latest successful observation for each local calendar day.

    A transaction prevents a slower, older instance from replacing a newer one.
    Returning False means an identical/newer observation is already durable.
    Storage failures propagate: callers must not claim persistence succeeded.
    """
    from google.cloud import firestore

    db = firestore_cache._db()
    if db is None:
        raise RuntimeError("Inventory history storage is unavailable")
    reference = _days(db, snapshot["marketplace"]).document(snapshot["date"])
    # Store rows as JSON to avoid indexing every product field.
    document = {key: value for key, value in snapshot.items() if key != "items"}
    document["items_json"] = json.dumps(snapshot["items"], ensure_ascii=False)
    if len(json.dumps(document, ensure_ascii=False).encode("utf-8")) > 900_000:
        raise ValueError("Inventory snapshot exceeds document capacity")

    @firestore.transactional
    def write(transaction):
        previous = reference.get(transaction=transaction)
        if previous.exists:
            old = previous.to_dict() or {}
            if old.get("collected_at", "") >= snapshot["collected_at"]:
                return False
        transaction.set(reference, document)
        return True

    return write(db.transaction())


def load_history(marketplace: str, days: int, *, now: datetime | None = None) -> dict:
    from google.cloud.firestore_v1.base_query import FieldFilter

    db = firestore_cache._db()
    if db is None:
        raise RuntimeError("Inventory history storage is unavailable")
    tz = TIMEZONES.get(marketplace, "UTC")
    today = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo(tz)).date()
    start = today - timedelta(days=days - 1)
    query = (_days(db, marketplace)
             .where(filter=FieldFilter("date", ">=", start.isoformat()))
             .where(filter=FieldFilter("date", "<=", today.isoformat()))
             .order_by("date").limit(days))
    records = []
    for document in query.stream():
        data = document.to_dict()
        data["items"] = json.loads(data.pop("items_json"))
        records.append(data)
    recorded = {row["date"] for row in records}
    missing = [(start + timedelta(days=i)).isoformat() for i in range(days)
               if (start + timedelta(days=i)).isoformat() not in recorded]
    return {"marketplace": marketplace, "timezone": tz, "start_date": start.isoformat(),
            "end_date": today.isoformat(), "records": records, "missing_dates": missing,
            "policy": "latest_successful_observation_per_day"}
