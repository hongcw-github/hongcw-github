# Cloud Run 용 백엔드(FastAPI) 컨테이너
FROM python:3.11-slim

WORKDIR /app

# 의존성 먼저 설치 (레이어 캐시)
COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

# 앱 코드
COPY src ./src
COPY api ./api
COPY costs.json ./costs.json

# Cloud Run 은 $PORT(기본 8080)로 트래픽을 보냄
ENV PORT=8080
EXPOSE 8080

# shell 형태로 $PORT 치환, exec 로 시그널 전달
CMD exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT}
