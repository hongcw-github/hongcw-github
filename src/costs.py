"""SKU별 매입 원가(COGS) 로딩. costs.json 에서 읽는다.

아마존 SP-API 는 상품 원가를 제공하지 않으므로, 진짜 순이익을 계산하려면
셀러가 직접 원가를 알려줘야 한다. costs.json 을 수정하면 바로 반영된다.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

_DEFAULT = Path(__file__).resolve().parent.parent / "costs.json"


def load_costs() -> dict[str, float]:
    path = os.getenv("COSTS_FILE", str(_DEFAULT))
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, float] = {}
    for k, v in data.items():
        if k.startswith("_"):
            continue
        try:
            out[k] = float(v)
        except (TypeError, ValueError):
            continue
    return out
