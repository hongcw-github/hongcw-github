"""Daily observations: calendar boundaries, zero stock, gaps and durable writes."""
import json
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd
from fastapi import HTTPException

from api import main
from src import inventory_history as history


def instant(value):
    return datetime.fromisoformat(value).timestamp()


def row(sku="A", quantity=0):
    return {"sku": sku, "product_name": sku, "fulfillable_quantity": quantity,
            "reserved_quantity": 0, "inbound_quantity": 0, "total_quantity": quantity}


class FakeDocument:
    def __init__(self, store, path):
        self.store, self.path = store, path

    def collection(self, name):
        return FakeCollection(self.store, self.path + "/" + name)

    def get(self, **kwargs):
        value = self.store.get(self.path)
        return SimpleNamespace(exists=value is not None, to_dict=lambda: value.copy() if value else {})


class FakeCollection:
    def __init__(self, store, path=""):
        self.store, self.path = store, path

    def document(self, name):
        return FakeDocument(self.store, self.path + "/" + name)


class FakeDB:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return FakeCollection(self.store, name)

    def transaction(self):
        return SimpleNamespace(set=lambda reference, value: self.store.__setitem__(reference.path, value))


class DailyInventoryTests(unittest.TestCase):
    def test_fallback_report_does_not_archive_unreported_quantities_as_zero(self):
        from src.sp_api_client import _parse_fba_inventory
        inv = _parse_fba_inventory("seller-sku\tQuantity Available\nA\t0\nB\t12\n")
        snapshot = history.build_snapshot(main._records(inv), "CA", 1000, inv.attrs["quantity_fields"])
        self.assertEqual(snapshot["totals"]["fulfillable_quantity"], 12)
        self.assertEqual(snapshot["items"][0]["fulfillable_quantity"], 0)
        self.assertIsNone(snapshot["totals"]["reserved_quantity"])
        self.assertIsNone(snapshot["totals"]["inbound_quantity"])
        self.assertIsNone(snapshot["totals"]["total_quantity"])

    def test_full_report_retains_reported_zero_quantities(self):
        from src.sp_api_client import _parse_fba_inventory
        inv = _parse_fba_inventory(
            "sku\tafn-fulfillable-quantity\tafn-reserved-quantity\tafn-inbound-working-quantity\t"
            "afn-inbound-shipped-quantity\tafn-inbound-receiving-quantity\tafn-total-quantity\nA\t4\t0\t0\t0\t0\t4\n"
        )
        snapshot = history.build_snapshot(main._records(inv), "CA", 1000, inv.attrs["quantity_fields"])
        self.assertEqual(snapshot["totals"]["reserved_quantity"], 0)
        self.assertEqual(snapshot["totals"]["inbound_quantity"], 0)

    def test_dashboard_collection_passes_field_availability_to_storage(self):
        inv = pd.DataFrame([row(quantity=3)])
        inv.attrs["quantity_fields"] = ["fulfillable_quantity"]
        main._inv_cache = None
        with patch.object(main.repository, "get_inventory", return_value=inv), patch.object(history, "save_snapshot") as save:
            main._inventory_cached(SimpleNamespace(use_mock=False, marketplace="CA"))
        self.assertIsNone(save.call_args.args[0]["totals"]["reserved_quantity"])
        main._inv_cache = None

    def test_canada_local_date_not_utc_and_zero_sku_is_retained(self):
        snapshot = history.build_snapshot([row()], "CA", instant("2026-10-24T02:00:00+00:00"))
        self.assertEqual(snapshot["date"], "2026-10-23")
        self.assertEqual(snapshot["items"][0]["fulfillable_quantity"], 0)
        self.assertEqual(snapshot["timezone"], "America/Toronto")

    def test_duplicate_sku_rows_consolidate_without_dropping_zero_stock(self):
        snapshot = history.build_snapshot([row("A", 2), row("A", 3), row("B")], "CA", 1000)
        self.assertEqual(len(snapshot["items"]), 2)
        self.assertEqual(snapshot["totals"]["fulfillable_quantity"], 5)

    def test_invalid_source_quantities_are_not_saved_as_zero(self):
        for value in [float("nan"), -1, 2.5]:
            with self.assertRaises(ValueError):
                history.build_snapshot([row(quantity=value)], "CA", 1000)

    def test_same_day_updates_next_day_preserved_and_old_retries_cannot_overwrite(self):
        db = FakeDB()
        snapshots = [history.build_snapshot([row(quantity=q)], "CA", instant(ts)) for q, ts in [
            (10, "2026-10-24T14:00:00+00:00"), (8, "2026-10-24T20:00:00+00:00"),
            (7, "2026-10-25T14:00:00+00:00")]]
        with patch.object(history.firestore_cache, "_db", return_value=db), patch(
            "google.cloud.firestore.transactional", side_effect=lambda fn: fn
        ):
            self.assertTrue(history.save_snapshot(snapshots[0]))
            self.assertTrue(history.save_snapshot(snapshots[1]))
            self.assertFalse(history.save_snapshot(snapshots[0]))
            self.assertTrue(history.save_snapshot(snapshots[2]))
        self.assertEqual(len(db.store), 2)
        first = db.store["inventory_daily/CA/days/2026-10-24"]
        self.assertEqual(json.loads(first["items_json"])[0]["fulfillable_quantity"], 8)

    def test_history_missing_days_are_not_filled_with_zero(self):
        record = history.build_snapshot([row()], "CA", instant("2026-10-24T14:00:00+00:00"))
        document = {key: value for key, value in record.items() if key != "items"}
        document["items_json"] = json.dumps(record["items"])
        class Query:
            def where(self, **kwargs): return self
            def order_by(self, *args): return self
            def limit(self, *args): return self
            def stream(self): return [SimpleNamespace(to_dict=lambda: document.copy())]
        with patch.object(history.firestore_cache, "_db", return_value=object()), patch.object(
            history, "_days", return_value=Query()
        ):
            result = history.load_history("CA", 3, now=datetime(2026, 10, 24, 15, tzinfo=timezone.utc))
        self.assertEqual(result["missing_dates"], ["2026-10-22", "2026-10-23"])
        self.assertEqual(len(result["records"]), 1)
        self.assertEqual(result["records"][0]["totals"]["total_quantity"], 0)

    def test_storage_failure_is_not_reported_as_success(self):
        with patch.object(main, "_DASHBOARD_PASSWORD", None), patch.object(
            main, "load_settings", return_value=SimpleNamespace(use_mock=False, marketplace="CA")
        ), patch.object(main, "_inventory_cached", return_value=pd.DataFrame([row()])), patch.object(
            main, "_inv_cache", (1000, object())
        ), patch.object(history, "save_snapshot", side_effect=RuntimeError("unavailable")), patch.object(main.logging, "exception"):
            with self.assertRaises(HTTPException) as result:
                main.inventory_daily_snapshot(None)
        self.assertEqual(result.exception.status_code, 503)

    def test_mock_inventory_never_enters_durable_history(self):
        main._inv_cache = None
        with patch.object(main.repository, "get_inventory", return_value=pd.DataFrame([row()])), patch.object(
            history, "save_snapshot"
        ) as save:
            main._inventory_cached(SimpleNamespace(use_mock=True))
        save.assert_not_called()
        main._inv_cache = None

    def test_snapshot_endpoint_preserves_dashboard_access_key(self):
        with patch.object(main, "_DASHBOARD_PASSWORD", "expected"):
            with self.assertRaises(HTTPException) as result:
                main.inventory_daily_snapshot("wrong")
        self.assertEqual(result.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
