"""Offline regression checks for cache freshness and currency metadata.

Run from the repository root: python -m unittest api.test_main
"""
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd

from api import main
from src import mock


class DashboardMetadataTests(unittest.TestCase):
    def setUp(self):
        main._cache.clear()
        main._fin_raw.clear()
        main._history_cache.clear()
        main._inv_cache = None

    def test_memory_response_preserves_build_time_without_mutating_payload(self):
        payload = {"metadata": {"generated_at": "2026-01-01T00:00:00+00:00"}}
        main._cache[30] = (time.time(), payload, 120)
        with patch.object(main, "_DASHBOARD_PASSWORD", None):
            result = main.dashboard(days=30, refresh=False)
        self.assertEqual(result["metadata"]["generated_at"], payload["metadata"]["generated_at"])
        self.assertEqual(result["metadata"]["cache_source"], "memory")
        self.assertNotIn("served_at", payload["metadata"])

    def test_legacy_firestore_cache_uses_save_time_without_inventing_build_time(self):
        with patch.object(main, "_DASHBOARD_PASSWORD", None), patch.object(
            main.firestore_cache, "load_dashboard", return_value={"payload": {"days": 30}, "ts": 1000}
        ):
            result = main.dashboard(days=30, refresh=False)
        self.assertEqual(result["metadata"]["cache_saved_at"], main._iso_timestamp(1000))
        self.assertEqual(result["metadata"]["cache_source"], "firestore")
        self.assertNotIn("generated_at", result["metadata"])

    def test_explicit_refresh_invalidates_inventory_and_matching_finance_window(self):
        main._inv_cache = (time.time(), object())
        main._fin_raw[30] = (time.time(), object())
        main._fin_raw[90] = (time.time(), object())

        def build(days):
            self.assertIsNone(main._inv_cache)
            self.assertNotIn(30, main._fin_raw)
            self.assertIn(90, main._fin_raw)
            return {section: {"error": None} for section in ("sales", "inventory", "finance")}

        with patch.object(main, "_DASHBOARD_PASSWORD", None), patch.object(
            main, "_build_dashboard", side_effect=build
        ), patch.object(main.firestore_cache, "save_dashboard"):
            result = main.dashboard(days=7, refresh=True, refresh_sources=True)
        self.assertFalse(result["cached"])
        self.assertEqual(result["metadata"]["cache_source"], "build")

    def test_cron_refresh_reuses_shared_inventory_and_finance_sources(self):
        inventory = (time.time(), object())
        finance = (time.time(), object())
        main._inv_cache = inventory
        main._fin_raw[30] = finance
        payload = {section: {"error": None} for section in ("sales", "inventory", "finance")}
        with patch.object(main, "_DASHBOARD_PASSWORD", None), patch.object(
            main, "_build_dashboard", return_value=payload
        ), patch.object(main.firestore_cache, "save_dashboard"):
            result = main.dashboard(days=7, refresh=True)
        self.assertIs(main._inv_cache, inventory)
        self.assertIs(main._fin_raw[30], finance)
        self.assertFalse(result["cached"])

    def test_assembly_labels_inferred_currency_and_real_latest_activity(self):
        settings = SimpleNamespace(use_mock=True, marketplace="CA", has_ads_credentials=False)
        orders = mock.orders(30)
        finances = mock.finances(30)
        with patch.object(main, "load_costs", return_value={}):
            result = main._assemble_dashboard(
                orders, mock.inventory(), finances, mock.finance_breakdown(30), mock.ads(30),
                settings, label=30,
            )
        self.assertEqual(result["currency"], "CAD")
        self.assertEqual(result["currency_source"], "marketplace_inferred")
        self.assertIsNone(result["metadata"]["source_updated_at"])
        self.assertEqual(result["metadata"]["latest_order_date"], max(r["date"] for r in result["sales"]["daily"]))
        self.assertEqual(result["metadata"]["latest_settlement_date"], max(r["date"] for r in result["finance"]["daily"]))

    def test_history_assembly_does_not_claim_new_source_collection(self):
        settings = SimpleNamespace(use_mock=False, marketplace="CA", has_ads_credentials=True)
        with patch.object(main, "load_settings", return_value=settings), patch.object(
            main.firestore_cache, "load_raw_months", return_value=[]
        ), patch.object(main.firestore_cache, "load_raw_inventory", return_value=[]), patch.object(
            main, "load_costs", return_value={}
        ):
            result = main._build_history("2024")
        self.assertNotIn("generated_at", result["metadata"])
        self.assertIn("assembled_at", result["metadata"])
        self.assertIsNone(result["metadata"]["source_updated_at"])
        self.assertEqual(result["ads"]["mode"], "mock")


if __name__ == "__main__":
    unittest.main()
