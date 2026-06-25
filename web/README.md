# Amazon 셀러 대시보드 — 웹앱 (Next.js + FastAPI)

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
