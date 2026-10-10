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
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```
→ http://localhost:3000

자격증명이 없으면 자동으로 **Mock 모드**(샘플 데이터)로 동작합니다.

## 배포

- **프론트(web/)** → Vercel (Root Directory 를 `web` 으로, `NEXT_PUBLIC_API_URL` 에 백엔드 주소)
- **백엔드(api/)** → Render / Railway / Fly.io 등에 `uvicorn api.main:app` 으로.
  환경변수에 SP-API 자격증명 + `DATA_SOURCE=live`, `CORS_ORIGINS` 에 프론트 도메인 지정.

## 구성

- 상단 KPI (매출/순수익/수량/주문/AOV)
- 탭: 주문/매출 · 재고 · 정산/수익
- 섹션별 graceful 에러 (한 API 가 막혀도 나머지는 표시)
- 기간 선택(7~90일) · 새로고침

<!-- redeploy: wire NEXT_PUBLIC_API_URL -->

## Seller Workspace 개편

- 반응형 탐색, 일별/주별 매출·수량 차트, SKU 비중과 파레토 분석
- 5분마다 서버 응답 재확인, 포커스/연결 복구 시 재조회, 명시적 새로고침 상태·오류 표시
- 조회 시각과 집계 생성 시각·최근 거래 날짜를 구분. 브라우저 재조회가 Amazon 수집 완료를 의미하지는 않음
- 지역 약칭 통합, 같은 SKU의 재고 합산, 최근 기간 기준 재고 커버일
- 원가 입력 누락 표시. 원가와 통화 표시 설정은 현재 브라우저에 저장되며 통화 환산 없음
- 미연동 광고 성과는 샘플값 대신 빈 상태로 표시. 정산 차감 광고비는 별도 제공
- CSV 내보내기와 접근성 개선

Node.js 22로 실행합니다. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`로 검증할 수 있습니다.
`NEXT_PUBLIC_API_URL`이 없으면 기존 Cloud Run API를 사용합니다. 자격증명은 프런트엔드 환경변수에 넣지 않습니다.

백엔드는 `python -m unittest api.test_main`으로 캐시 메타데이터와 전체 항목 새로고침을 검증합니다.
Cloud Run과 Vercel은 기존 production 브랜치 변경에 각각 연결되어 있습니다.
