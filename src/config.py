"""환경설정 로딩. .env 파일에서 SP-API 자격증명과 데이터 소스를 읽어온다."""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

# SP-API 마켓플레이스 코드 -> python-amazon-sp-api Marketplaces enum 이름 매핑에 사용
DEFAULT_MARKETPLACE = "US"


@dataclass(frozen=True)
class Settings:
    data_source: str  # "mock" 또는 "live"
    marketplace: str

    # SP-API (LWA)
    refresh_token: str | None
    lwa_app_id: str | None
    lwa_client_secret: str | None

    # Amazon Ads API (선택)
    ads_client_id: str | None
    ads_client_secret: str | None
    ads_refresh_token: str | None
    ads_profile_id: str | None

    @property
    def has_sp_api_credentials(self) -> bool:
        return all([self.refresh_token, self.lwa_app_id, self.lwa_client_secret])

    @property
    def use_mock(self) -> bool:
        # 명시적으로 mock 이거나, live 인데 자격증명이 없으면 mock 으로 폴백
        if self.data_source == "mock":
            return True
        return not self.has_sp_api_credentials


def _get(name: str) -> str | None:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else None


def load_settings() -> Settings:
    return Settings(
        data_source=(_get("DATA_SOURCE") or "mock").lower(),
        marketplace=_get("SP_API_MARKETPLACE") or DEFAULT_MARKETPLACE,
        refresh_token=_get("SP_API_REFRESH_TOKEN"),
        lwa_app_id=_get("SP_API_LWA_APP_ID"),
        lwa_client_secret=_get("SP_API_LWA_CLIENT_SECRET"),
        ads_client_id=_get("ADS_CLIENT_ID"),
        ads_client_secret=_get("ADS_CLIENT_SECRET"),
        ads_refresh_token=_get("ADS_REFRESH_TOKEN"),
        ads_profile_id=_get("ADS_PROFILE_ID"),
    )
