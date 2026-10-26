# Router + OpenAI-compatible proxy (CPU). Base Laya weights are baked in so cold starts don't download.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 USE_TF=0 HF_HOME=/app/hf_cache TOKENIZERS_PARALLELISM=false \
    ROUTER_DEVICE=cpu SERVE_DIR=/app/router/serve STATS_PATH=/data/stats.json
WORKDIR /app

RUN pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements-serve.txt .
RUN pip install --no-cache-dir -r requirements-serve.txt
RUN python -c "from laya.train import resolve_checkpoint_dir; print(resolve_checkpoint_dir('convaiinnovations/laya'))"

COPY config/ config/
COPY router/ router/
COPY server/ server/

# Trained policy deltas (~150 MB each, too big for git) come from a release asset tarball:
#   tar czf serve.tgz -C router serve   ->  upload to a GitHub release  ->  --build-arg SERVE_TGZ_URL=...
ARG SERVE_TGZ_URL=""
RUN if [ -n "$SERVE_TGZ_URL" ]; then python -c "import urllib.request,tarfile,io,sys;     tarfile.open(fileobj=io.BytesIO(urllib.request.urlopen(sys.argv[1]).read())).extractall('router')" "$SERVE_TGZ_URL"; fi

# config/models.yaml is read at startup; API keys come from env vars (never baked in).
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server.app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
