"""데이터 접근 계층.

설정에 따라 mock 또는 live(SP-API) 소스를 선택해 동일한 형태의
DataFrame 을 반환한다. 대시보드(app.py)는 이 모듈만 알면 된다.
"""
from __future__ import annotations

import pandas as pd

from . import mock
from .config import Settings, load_settings


def _live_or_mock(settings: Settings):
    if settings.use_mock:
        return mock
    # live 모드에서만 무거운 sp_api 의존성을 import
    from . import sp_api_client

    return sp_api_client


def get_orders(settings: Settings | None = None, days: int = 90) -> pd.DataFrame:
    settings = settings or load_settings()
    source = _live_or_mock(settings)
    if source is mock:
        return mock.orders(days)
    return source.orders(settings, days)


def get_inventory(settings: Settings | None = None) -> pd.DataFrame:
    settings = settings or load_settings()
    source = _live_or_mock(settings)
    if source is mock:
        return mock.inventory()
    return source.inventory(settings)


def get_finances(settings: Settings | None = None, days: int = 90) -> pd.DataFrame:
    settings = settings or load_settings()
    source = _live_or_mock(settings)
    if source is mock:
        return mock.finances(days)
    return source.finances(settings, days)


def get_finance_breakdown(settings: Settings | None = None, days: int = 90) -> pd.DataFrame:
    settings = settings or load_settings()
    source = _live_or_mock(settings)
    if source is mock:
        return mock.finance_breakdown(days)
    return source.finance_breakdown(settings, days)
