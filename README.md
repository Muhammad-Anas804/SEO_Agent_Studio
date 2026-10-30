# SEO Agent Studio

A multi-agent SEO content pipeline (FastAPI + Gemini backend, Next.js frontend).
Enter a keyword and five agents produce: search intent and related keywords, an outline with
content gaps, a full article with meta tags, Article and FAQ JSON-LD, and (Pro) internal link
suggestions chosen from your real site pages.

## Features

- **Multiple AI providers with automatic fallback:** Gemini, Groq, OpenAI and Anthropic. Choose a primary model and up to 4 fallbacks in the app (AI button), test each connection, and the pipeline switches models when one is overloaded, rate-limited, out of credit or rejects the key. Each run records which model answered and tells you when a fallback was used.
- **Writing controls:** choose tone, target length (800-2,500 words) and language per article.
- **Real competitor research (Pro):** top Google results, People Also Ask and related searches (via Serper), used to build the outline and FAQ. Cached for 24 hours to save credits. Needs `SERPER_API_KEY`; without it the step is skipped.
- **SEO score (0-100):** automatic on-page checks (title and description length, keyword placement and density, headings, length, readability, schema, internal links) with a pass/fail list.
- **Exports:** download Markdown (with front matter), CMS-ready HTML (sanitized, with meta tags and JSON-LD) or the full JSON.
- **Run history:** reopen or delete any past run.
- **Usage limits:** daily run quota per plan, shown in the UI (`FREE_DAILY_RUNS`, `PRO_DAILY_RUNS`).
- **Free vs Pro:** Pro adds internal link suggestions chosen from your own pages; the plan comes from the server-side API key.
- **Production basics:** retries with backoff, per-step telemetry, request IDs, rate limiting, strict CORS, fail-fast config checks.

## AI providers and fallback

Set the keys you have in `.env` (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). Then either use the **AI** button in the app, or set `AI_PRIMARY` and `AI_FALLBACKS` (format `provider:model`).

- Models run in order. Retryable errors (rate limits, 5xx, timeouts, network, invalid output) are retried a bounded number of times with backoff, honouring `Retry-After`. If a fallback exists and the wait would be long, it switches immediately.
- Non-retryable errors (bad key, unknown model, bad request, exhausted quota) skip straight to the next model.
- The same model is never tried twice, and there is an overall deadline (`AI_DEADLINE_SECONDS`).
- If every model fails the run fails with a clear message. No content is invented.
- Changing settings needs a key listed in `ADMIN_API_KEYS`. API keys never leave the server.
- The model lists in the app are suggestions (override with `AI_MODEL_CATALOG`). Whether you can use a model depends on your account, so use **Test connection**.
- Verified against real services: only Gemini (during development). The Groq, OpenAI and Anthropic adapters are tested against mocked HTTP only: test each with your own key before relying on it.

## How it works

```
Browser -> Next.js (server routes hold the API key) -> FastAPI -> Gemini
                                                        |
                                                  SQLite (runs)
```

- `POST /api/v1/generate-seo-campaign` returns `202` with a `run_id`; the pipeline runs in the background.
- `GET /api/v1/runs/{run_id}` returns status (`queued | running | completed | partial | failed`) plus live results.
- `GET /api/v1/runs`, `DELETE /api/v1/runs/{id}`, `GET /api/v1/runs/{id}/export?format=md|html|json`, `GET /api/v1/usage`, `GET /api/v1/me`, `GET /health`.
- Plan tier (free or pro) comes from the API key on the server, never from the client.

## Run locally

```bash
# backend (repo root)
python -m venv venv && source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                               # add GEMINI_API_KEY
uvicorn seo_agents.api:app --reload                # http://127.0.0.1:8000/docs
pytest                                             # 57 tests, no network or API key needed

# frontend
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

With `API_KEYS` empty, the backend runs without auth for local development only.

## Deploy

**Backend (Railway, Render, Fly or any Docker host)**
1. Deploy the `Dockerfile` (or start with `uvicorn seo_agents.api:app --host 0.0.0.0 --port $PORT --workers 1`).
2. Set env vars: `ENVIRONMENT=production`, `GEMINI_API_KEY`, `API_KEYS` (long random keys, e.g. `abc...:pro`), `ALLOWED_ORIGINS=https://your-frontend-domain`.
3. **Attach a persistent volume** and set `DATABASE_PATH=/data/seo_agent.db`. Without it, run history is lost on every redeploy.
4. Production refuses to start if the Gemini key or API keys are missing, or if CORS is `*`.

**Frontend (Vercel)**
1. Root directory: `frontend`.
2. Env vars: `BACKEND_URL` (backend public URL), `BACKEND_API_KEY` (one of the backend `API_KEYS`), and `APP_ACCESS_PASSWORD` to password-protect the app.
3. These are server-side only; the browser never sees the API key.

## Security notes

- API key auth with constant-time comparison; runs are private per key.
- Per-key rate limit and a cap on concurrent runs (`MAX_CONCURRENT_RUNS`).
- Inputs validated and sanitized; user text is passed to the model as data with an injection-resistant system prompt.
- Strict CORS, no credentials, docs disabled in production, security headers on the frontend.

## What changed from the original zip

- Fixed the frontend/backend mismatch (the UI called an endpoint that did not exist) and the broken `@/types/seo` import.
- Added missing project files: Next.js/Tailwind/TypeScript config, layout, `google-genai` dependency.
- Pro status was a client-controlled header; it is now tied to the server-side API key.
- Long-running Gemini calls no longer block the request; runs are background jobs with polling.
- Added retries with backoff, per-step audit logs, and stop-on-failure so later agents never work on missing data.
- JSON-LD is built in code (always valid) instead of asking the model to write JSON strings.
- Internal links are restricted to paths you supply; model-invented pages are discarded.
- Added persistence, tests (22), CI, Dockerfile and docs. The old `/api/run-seo` endpoint was replaced by the versioned API above.

## Known limits (read before selling)

- **Competitor research uses titles and snippets only.** With `SERPER_API_KEY` the outline is built from real Google results, but full competitor pages are not fetched or analysed. Without the key the outline is the model's own analysis.
- **Fact accuracy.** Prompts forbid invented statistics, but every article needs human review before publishing.
- **Single instance.** SQLite, the in-memory rate limiter and in-process jobs suit one server. For multiple instances move to Postgres, Redis and a job queue.
- **No user accounts or billing.** Access is by API key and a shared password. For paying customers add auth (Clerk/Auth.js), per-user keys and Stripe.
- **No CMS publishing.** `ready_for_cms_publish` is a flag; connectors (WordPress, Webflow, custom API) are not built yet.
