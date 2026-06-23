# Amazon 셀러 대시보드

Amazon SP-API(Selling Partner API)로 셀러 계정의 **주문/매출 · 재고 · 정산** 데이터를
불러와 보여주는 Streamlit 대시보드입니다. 자격증명이 없어도 **Mock 모드**로 바로 화면을 볼 수 있습니다.

## 빠른 시작 (Mock 모드 — 자격증명 불필요)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

브라우저에서 샘플 데이터로 채워진 대시보드가 바로 열립니다.

## 실제 데이터 연결 (Live 모드)

1. `.env.example` 을 `.env` 로 복사합니다.
   ```bash
   cp .env.example .env
   ```
2. SP-API 자격증명을 채웁니다.
   ```
   DATA_SOURCE=live
   SP_API_REFRESH_TOKEN=...
   SP_API_LWA_APP_ID=...
   SP_API_LWA_CLIENT_SECRET=...
   SP_API_MARKETPLACE=CA
   ```
3. 다시 실행: `streamlit run app.py`

## SP-API 자격증명 발급 방법

본인 셀러 계정의 데이터만 볼 거라면 **공개 앱 심사 없이** 셀프 인증(private app)으로 충분합니다.

1. **Seller Central** 로그인 → 우상단 **Apps & Services > Develop Apps**
2. **Add new app client** 로 앱 생성 → `LWA App ID`(client id)와 `Client Secret` 발급
3. 앱의 **Authorize** → **Authorize app** 으로 본인 계정 연결 → `Refresh Token` 발급
4. 위 3개 값을 `.env` 에 입력

> 광고(ADS) 데이터는 별도의 **Amazon Ads API** 인증이 필요합니다. (`.env` 의 `ADS_*` 항목)

## 클라우드 배포 (Streamlit Community Cloud)

언제든 웹에서 접속할 수 있게 배포하는 무료 방법입니다. 자격증명은 레포에 넣지 않고
Streamlit Cloud 의 **Secrets** 로 관리합니다.

1. 이 레포를 GitHub 에 둔 상태에서 <https://share.streamlit.io> 에 GitHub 로 로그인
2. **New app** → 이 레포 / 브랜치 / `app.py` 선택
3. **Advanced settings → Secrets** 에 `.streamlit/secrets.toml.example` 형식대로 값 입력:
   ```toml
   DATA_SOURCE = "live"
   SP_API_MARKETPLACE = "CA"
   SP_API_LWA_APP_ID = "amzn1.application-oa2-client.xxxx"
   SP_API_LWA_CLIENT_SECRET = "xxxx"
   SP_API_REFRESH_TOKEN = "Atzr|xxxx"
   ```
4. **Deploy** → 발급된 URL 로 어디서나 접속

코드(`src/config.py`)는 환경변수(`.env`)가 없으면 자동으로 **Streamlit Secrets** 를 읽으므로,
로컬은 `.env`, 클라우드는 Secrets 로 동일하게 동작합니다.

> ⚠️ 배포한 앱은 URL 을 아는 사람이 볼 수 있으므로, 비공개로 두려면 Streamlit Cloud 의
> **앱 공유 설정에서 viewer 를 본인 계정으로 제한**하세요.

## 구조

```
app.py                  # Streamlit 대시보드 (UI)
src/
  config.py             # .env 설정 로딩
  repository.py         # mock/live 소스 선택 (대시보드는 이 모듈만 사용)
  mock.py               # 샘플 데이터 생성
  sp_api_client.py      # 실제 SP-API 호출 (Orders/Inventory/Finances)
```

`repository.py` 가 mock 과 live 를 동일한 DataFrame 형태로 추상화하므로,
자격증명을 넣고 `DATA_SOURCE=live` 로 바꾸면 대시보드 코드 변경 없이 실제 데이터로 전환됩니다.
```
