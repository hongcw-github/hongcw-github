"""대시보드 빌드 결과를 Firestore 에 영구 저장하는 캐시 계층.

무거운 SP-API 리포트 빌드는 비싸고, 인메모리 캐시는 Cloud Run 인스턴스가
콜드스타트/재활용될 때마다 사라진다. 빌드된 payload 를 여기에 저장해 두면
어떤 인스턴스든 마지막으로 성공한 결과를 즉시 서빙할 수 있고, 예열 크론이
백그라운드에서 이를 갱신한다.

Fail-soft: Firestore 를 못 쓰면 모든 함수가 조용히 no-op 이 되어, API 는
인메모리 캐시만으로도 정상 동작한다.
"""
from __future__ import annotations

import json
import os
import time

_ENABLED = os.getenv("FIRESTORE_CACHE", "on").lower() != "off"
_COLLECTION = os.getenv("FIRESTORE_COLLECTION", "dashboards")

_client = None
_disabled = not _ENABLED


def _db():
    global _client, _disabled
    if _disabled:
        return None
    if _client is not None:
        return _client
    try:
        from google.cloud import firestore  # lazy import; optional dependency
        _client = firestore.Client()
        return _client
    except Exception as e:  # noqa: BLE001
        print(f"[firestore_cache] disabled ({e})")
        _disabled = True
        return None


def load_dashboard(days: int):
    """저장된 payload 반환: {"payload": dict, "ts": float} 또는 None."""
    db = _db()
    if db is None:
        return None
    try:
        snap = db.collection(_COLLECTION).document(str(days)).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        raw = data.get("json")
        if not raw:
            return None
        return {"payload": json.loads(raw), "ts": float(data.get("ts") or 0.0)}
    except Exception as e:  # noqa: BLE001
        print(f"[firestore_cache] load failed ({e})")
        return None


def save_dashboard(days: int, payload: dict) -> None:
    db = _db()
    if db is None:
        return
    try:
        db.collection(_COLLECTION).document(str(days)).set({
            "days": days,
            "ts": time.time(),
            "json": json.dumps(payload, default=str),
        })
    except Exception as e:  # noqa: BLE001
        print(f"[firestore_cache] save failed ({e})")
