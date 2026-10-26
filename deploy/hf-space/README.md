---
title: Laya Router
emoji: 🔀
colorFrom: indigo
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
short_description: RL-trained open decision model that routes LLM calls
---

# Laya Router: live routing API + OpenAI-compatible proxy

This Space serves `server/app.py` from the laya-router repo:
- `POST /route`, `POST /answer`, `GET /health`
- `POST /v1/chat/completions`, `GET /v1/models`

Routing uses ONNX Runtime on CPU with the RL-trained Laya policies.

**Secrets to set in the Space settings** (never in files):
- `NVIDIA_API_KEY`: the model tiers (free tier; when it's rate-limited, the website falls back to recorded runs)
- `ALLOWED_ORIGINS`: the Vercel site URL

Deploy steps (run only once the owner approves publishing):
```bash
# from the repo root
python -m router.serve_policy --export && python -m router.onnx_serve --export
huggingface-cli upload <user>/laya-router . --repo-type space \
  --include "Dockerfile" "requirements-serve.txt" "config/*" "router/*.py" "router/serve/*" "server/*.py"
cp deploy/hf-space/README.md /tmp/README.md && huggingface-cli upload <user>/laya-router /tmp/README.md README.md --repo-type space
```
The Dockerfile reads `PORT` (set it to 7860 in the Space variables, or rely on `app_port`).
