FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY seo_agents ./seo_agents
RUN useradd -m app && mkdir -p /data && chown app /data
USER app

ENV ENVIRONMENT=production DATABASE_PATH=/data/seo_agent.db PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health')"

# One worker: runs execute in-process and the rate limiter is in-memory.
CMD ["sh", "-c", "uvicorn seo_agents.api:app --host 0.0.0.0 --port ${PORT} --workers 1"]
