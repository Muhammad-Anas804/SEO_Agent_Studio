from __future__ import annotations

import logging
import re
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from seo_agents.ai.ai_config import AIConfig, ModelRef, catalog, load_config, save_config
from seo_agents.ai.fallback import test_model
from seo_agents.ai.registry import get_provider, provider_names
from seo_agents.config import get_settings
from seo_agents.database import store
from seo_agents.export import build_export
from seo_agents.images import service as image_service
from seo_agents.security import Principal, get_principal, rate_limited, require_admin
from seo_agents.seo_brain import SEOAutomationEngine
from seo_agents.State import SEOState

settings = get_settings()
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("seo_agents.api")

_slots = threading.BoundedSemaphore(settings.max_concurrent_runs)


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings().validate()
    if not get_settings().gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set: runs will fail until it is configured")
    store.init_db()
    interrupted = store.fail_interrupted_runs()
    if interrupted:
        logger.warning("Marked %s interrupted run(s) as failed", interrupted)
    yield


app = FastAPI(
    title="SEO Agent SaaS API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


_REQUEST_ID = re.compile(r"^[A-Za-z0-9\-]{1,64}$")


@app.middleware("http")
async def request_context(request, call_next):
    incoming = request.headers.get("x-request-id", "")
    rid = incoming if _REQUEST_ID.match(incoming) else uuid.uuid4().hex[:12]
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api"):
        response.headers.setdefault("Cache-Control", "no-store")
    logger.info("%s %s %s %.0fms rid=%s", request.method, request.url.path, response.status_code,
                (time.perf_counter() - started) * 1000, rid)
    return response


class GenerateRequest(BaseModel):
    target_keyword: str = Field(..., min_length=2, max_length=120)
    target_url: Optional[str] = ""
    site_paths: List[str] = Field(default_factory=list, max_length=200)
    generate_image: bool = False
    tone: str = "professional"
    word_count_target: int = 1500
    language: str = "English"


def _daily_limit(tier: str) -> int:
    s = get_settings()
    return s.pro_daily_runs if tier == "pro" else s.free_daily_runs


def _day_window() -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.isoformat(), start + timedelta(days=1)


@app.get("/")
def root():
    return {"service": "seo-agent-saas", "status": "ok"}


@app.get("/health")
def health():
    try:
        store.list_runs("healthcheck", 1)
    except Exception as exc:
        logger.error("health check failed: %s", exc)
        raise HTTPException(status_code=503, detail="database unavailable")
    return {"status": "ok"}


@app.get("/api/v1/me")
def me(principal: Principal = Depends(get_principal)):
    return {"tier": principal.tier}


@app.get("/api/v1/usage")
def usage(principal: Principal = Depends(get_principal)):
    since, resets = _day_window()
    return {
        "tier": principal.tier,
        "used_today": store.count_runs_since(principal.owner_id, since),
        "daily_limit": _daily_limit(principal.tier),
        "resets_at": resets.isoformat(),
    }


@app.post("/api/v1/generate-seo-campaign", status_code=202)
def generate(
    body: GenerateRequest,
    background: BackgroundTasks,
    principal: Principal = Depends(rate_limited),
):
    if body.generate_image and not principal.is_pro:
        raise HTTPException(status_code=403, detail="Image generation is a Pro feature")
    run_id = str(uuid.uuid4())
    try:
        state = SEOState(
            run_id=run_id,
            target_keyword=body.target_keyword,
            target_url=body.target_url,
            site_paths=body.site_paths,
            tone=body.tone,
            word_count_target=body.word_count_target,
            language=body.language,
            owner_id=principal.owner_id,
            generate_image=body.generate_image,
            is_pro_tier=principal.is_pro,  # decided by the API key, never by the client
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=[e["msg"] for e in exc.errors()])

    since, resets = _day_window()
    limit = _daily_limit(principal.tier)
    if store.count_runs_since(principal.owner_id, since) >= limit:
        wait = max(1, int((resets - datetime.now(timezone.utc)).total_seconds()))
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit reached ({limit} runs on the {principal.tier} plan). Resets at 00:00 UTC.",
            headers={"Retry-After": str(wait)},
        )

    if not _slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Server is busy, try again shortly", headers={"Retry-After": "15"})
    try:
        record = store.create_run(run_id, principal.owner_id, principal.tier, state.target_keyword)
        background.add_task(_execute_run, state)
    except Exception:
        _slots.release()
        raise
    return record


def _execute_run(state: SEOState) -> None:
    run_id = state.run_id
    try:
        store.update_run(run_id, "running", state.model_dump_json())
        engine = SEOAutomationEngine(
            is_pro=state.is_pro_tier,
            on_progress=lambda s: store.update_run(run_id, "running", s.model_dump_json()),
        )
        final = engine.execute_pipeline(state)
        if final.generated_article_markdown and not final.errors:
            status = "completed"
        elif final.generated_article_markdown:
            status = "partial"
        else:
            status = "failed"
        store.update_run(run_id, status, final.model_dump_json())
    except Exception as exc:
        logger.exception("run %s crashed", run_id)
        state.errors.append(f"Unexpected error: {exc}")
        store.update_run(run_id, "failed", state.model_dump_json())
    finally:
        _slots.release()


@app.get("/api/v1/runs")
def list_runs(limit: int = 20, principal: Principal = Depends(get_principal)):
    return store.list_runs(principal.owner_id, max(1, min(limit, 100)))


@app.get("/api/v1/runs/{run_id}")
def get_run(run_id: str, principal: Principal = Depends(get_principal)):
    record = store.get_run(run_id, principal.owner_id)
    if not record:
        raise HTTPException(status_code=404, detail="Run not found")
    return record


@app.get("/api/v1/runs/{run_id}/export")
def export_run(
    run_id: str,
    fmt: str = Query("html", alias="format"),
    principal: Principal = Depends(get_principal),
):
    if fmt not in ("md", "html", "json"):
        raise HTTPException(status_code=422, detail="format must be md, html or json")
    record = store.get_run(run_id, principal.owner_id)
    if not record:
        raise HTTPException(status_code=404, detail="Run not found")
    data = record["data"]
    if not data or not data.get("generated_article_markdown"):
        raise HTTPException(status_code=409, detail="Nothing to export yet")
    hero = image_service.load_image(run_id) if data.get("hero_image") else None
    content, media_type, filename = build_export(data, fmt, hero)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/api/v1/runs/{run_id}", status_code=204)
def delete_run(run_id: str, principal: Principal = Depends(get_principal)):
    record = store.get_run(run_id, principal.owner_id)
    if not record:
        raise HTTPException(status_code=404, detail="Run not found")
    if record["status"] in ("queued", "running"):
        raise HTTPException(status_code=409, detail="Run is still in progress")
    store.delete_run(run_id, principal.owner_id)
    image_service.delete_image(run_id)
    return Response(status_code=204)


def _ai_settings_payload(principal: Principal) -> dict:
    config, source = load_config()
    models = catalog()
    return {
        "config": config.model_dump(),
        "source": source,
        "can_edit": principal.is_admin,
        "providers": [
            {"name": n, "label": get_provider(n).label, "configured": get_provider(n).is_configured(), "models": models.get(n, [])}
            for n in provider_names()
        ],
    }


@app.get("/api/v1/ai/settings")
def get_ai_settings(principal: Principal = Depends(get_principal)):
    return _ai_settings_payload(principal)


@app.put("/api/v1/ai/settings")
def put_ai_settings(body: AIConfig, principal: Principal = Depends(require_admin)):
    save_config(body)
    logger.info("AI settings updated primary=%s/%s fallbacks=%s enabled=%s", body.primary.provider, body.primary.model,
                [f"{f.provider}/{f.model}" for f in body.fallbacks], body.fallback_enabled)
    return _ai_settings_payload(principal)


@app.post("/api/v1/ai/test")
def test_ai_model(body: ModelRef, principal: Principal = Depends(require_admin)):
    return test_model(body, timeout_seconds=get_settings().llm_timeout_seconds)


class KBPage(BaseModel):
    path: str = Field(..., max_length=200)
    title: str = Field("", max_length=200)
    content: str = Field(..., max_length=200_000)


def _kb_store():
    try:
        from seo_agents.kb import store as kb
    except ImportError:
        raise HTTPException(status_code=503, detail="Knowledge base libraries are not installed on the server")
    return kb


def _require_pro(principal: Principal) -> None:
    if not principal.is_pro:
        raise HTTPException(status_code=403, detail="The knowledge base is a Pro feature")


@app.get("/api/v1/kb/pages")
def kb_list(principal: Principal = Depends(get_principal)):
    kb = _kb_store()
    return {"pages": kb.list_pages(principal.owner_id), "limit": get_settings().kb_max_pages}


@app.post("/api/v1/kb/pages")
def kb_add(body: KBPage, principal: Principal = Depends(rate_limited)):
    _require_pro(principal)
    kb = _kb_store()
    try:
        chunks = kb.upsert_page(principal.owner_id, body.path, body.title, body.content)
    except kb.KBError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"path": body.path, "chunks": chunks}


@app.delete("/api/v1/kb/pages", status_code=204)
def kb_delete(path: str = Query(..., max_length=200), principal: Principal = Depends(get_principal)):
    kb = _kb_store()
    try:
        removed = kb.delete_page(principal.owner_id, path)
    except kb.KBError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if not removed:
        raise HTTPException(status_code=404, detail="Page not found")
    return Response(status_code=204)

@app.get("/api/v1/runs/{run_id}/image")
def get_run_image(run_id: str, principal: Principal = Depends(get_principal)):
    record = store.get_run(run_id, principal.owner_id)
    hero = ((record or {}).get("data") or {}).get("hero_image")
    if not record or not hero:
        raise HTTPException(status_code=404, detail="No image for this run")
    stored = image_service.load_image(run_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Image file is missing")
    data, mime = stored
    return Response(
        content=data,
        media_type=mime,
        headers={"Cache-Control": "private, max-age=3600",
                 "Content-Disposition": f'inline; filename="hero.{image_service.EXTENSIONS[mime]}"'},
    )