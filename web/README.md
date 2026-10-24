# Amazon 셀러 대시보드 — 웹앱 (Next.js + FastAPI)

> 배포: Vercel(프론트, Root Directory=`web`) + Render(백엔드).

세련된 React 대시보드. 화면은 Next.js, 데이터는 기존 Python 계층을 재사용한
FastAPI 백엔드가 제공합니다.

```
web/        Next.js + React + Tailwind 프론트엔드 (이 폴더)
api/        FastAPI 백엔드 (src/ 데이터 계층 재사용)
src/        SP-API 연동 / 집계 로직 (Streamlit·FastAPI 공용)
app.py      기존 Streamlit 버전 (폴백으로 유지)
```

## 로컬 실행 (백엔드 + 프론트 따로)

**1) 백엔드 (FastAPI)** — 루트에서:
```bash
pip install -r api/requirements.txt
# 실데이터면 .env 에 SP-API 자격증명 + DATA_SOURCE=live
uvicorn api.main:app --reload --port 8000
```

**2) 프론트엔드 (Next.js)** — web/ 에서:
```bash
cd web
cp .env.local.example .env.local   # NEXT_PUBLIC_SELLER_API_URL=http://localhost:8000
npm install
npm run dev
```
→ http://localhost:3000

자격증명이 없으면 자동으로 **Mock 모드**(샘플 데이터)로 동작합니다.

## 배포

- **프론트(web/)** → Vercel (Root Directory 를 `web` 으로, `NEXT_PUBLIC_SELLER_API_URL` 에 백엔드 주소)
- **백엔드(api/)** → Render / Railway / Fly.io 등에 `uvicorn api.main:app` 으로.
  환경변수에 SP-API 자격증명 + `DATA_SOURCE=live`, `CORS_ORIGINS` 에 프론트 도메인 지정.

## 구성

- 상단 KPI (매출/순수익/수량/주문/AOV)
- 탭: 주문/매출 · 재고 · 정산/수익
- 섹션별 graceful 에러 (한 API 가 막혀도 나머지는 표시)
- 기간 선택(7~90일) · 새로고침

<!-- redeploy: wire NEXT_PUBLIC_SELLER_API_URL -->

## Seller Workspace 개편

- 반응형 탐색, 일별/주별 매출·수량 차트, SKU 비중과 파레토 분석
- 5분마다 서버 응답 재확인, 포커스/연결 복구 시 재조회, 명시적 새로고침 상태·오류 표시
- 조회 시각과 집계 생성 시각·최근 거래 날짜를 구분. 브라우저 재조회가 Amazon 수집 완료를 의미하지는 않음
- 지역 약칭 통합, 같은 SKU의 재고 합산, 최근 기간 기준 재고 커버일
- 원가 입력 누락 표시. 원가와 통화 표시 설정은 현재 브라우저에 저장되며 통화 환산 없음
- 미연동 광고 성과는 샘플값 대신 빈 상태로 표시. 정산 차감 광고비는 별도 제공
- CSV 내보내기와 접근성 개선

Node.js 22로 실행합니다. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`로 검증할 수 있습니다.
`NEXT_PUBLIC_SELLER_API_URL`이 없으면 기존 Cloud Run API를 사용합니다. 자격증명은 프런트엔드 환경변수에 넣지 않습니다.

백엔드는 `python -m unittest api.test_main`으로 캐시 메타데이터와 전체 항목 새로고침을 검증합니다.
Cloud Run과 Vercel은 기존 production 브랜치 변경에 각각 연결되어 있습니다.

### 일별 재고 기록

- Firestore `inventory_daily/{marketplace}/days/{YYYY-MM-DD}`에 **실제 SP-API 재고**를 날짜별로 보관합니다. CA는 `America/Toronto` 기준이며 같은 날은 마지막 정상 수집값을 유지합니다. 일 마감 확정 잔액이 아닙니다.
- 0개인 SKU도 보존하며, 중복 SKU 수량은 합산합니다. 실패한 수집이나 데모 데이터는 기록하지 않습니다. 과거 날짜와 누락된 날짜를 0으로 채우지 않습니다.
- `GET /api/inventory/history?days=30` (1–366일)로 조회합니다. `POST /api/inventory/snapshot`은 재고 수집·저장이 성공해야 200을 반환합니다. 기존 `X-Dashboard-Key` 접근 키를 동일하게 적용합니다.
- 기본 브랜치의 `Prewarm backend` GitHub Actions 작업이 매시간 재고를 먼저 저장합니다. 나머지 대시보드 집계와 독립된 단계이며, 저장 실패는 작업 실패로 표시합니다. 같은 수집값은 다시 저장하지 않고, 다른 인스턴스의 오래된 수집값은 트랜잭션으로 차단합니다.
- GitHub 예약 실행은 지연될 수 있고 공개 저장소의 장기 비활성 시 중지될 수 있으므로 Actions 상태를 확인해야 합니다. 작업에서 고정된 현재 Cloud Run 주소를 사용하며, 접근 키를 설정했다면 `DASHBOARD_KEY` Actions secret도 설정해야 합니다.
- 기록은 재고 관측값입니다. 증가분을 실제 입고로 단정하지 않으며, 과거 입출고 복원은 별도의 Inventory Ledger 보고서 연동이 필요합니다.
