"""
Graph nodes. Each node runs ONE existing agent method from SEOAutomationEngine
and reproduces what execute_pipeline did around it: timing, audit log, error
handling, AI usage collection and progress notification.

The SEOState is mutated in place ON PURPOSE: api.py's progress callback and the
caller hold a reference to the same object, exactly as with the legacy engine.
"""
import logging
import time

from seo_agents import llm
from seo_agents.State import AgentAuditLog
from seo_agents.seo_brain import CRITICAL_AGENTS, SEOAutomationEngine

from .state import GraphState

logger = logging.getLogger("seo_agents.graph")


def make_agent_node(name: str, method: str, engine: SEOAutomationEngine):
    def node(graph_state: GraphState) -> dict:
        state = graph_state["seo"]
        llm.start_usage_log()  # reset per node so usage is attributed to the right agent
        started = time.perf_counter()
        try:
            status, details = getattr(engine, method)(state)
        except Exception as exc:
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            message = f"{name} failed: {exc}"
            logger.error("run_id=%s %s", state.run_id, message)
            state.errors.append(message)
            state.audit_trail.append(
                AgentAuditLog(agent_name=name, execution_time_ms=elapsed, status="FAILED", details=str(exc))
            )
            engine._collect_usage(state, name)
            engine._notify(state)
            return {"seo": state, "halted": name in CRITICAL_AGENTS}

        elapsed = round((time.perf_counter() - started) * 1000, 2)
        state.audit_trail.append(
            AgentAuditLog(agent_name=name, execution_time_ms=elapsed, status=status, details=details)
        )
        engine._collect_usage(state, name)
        engine._notify(state)
        return {"seo": state, "halted": False}

    return node


def make_finalize_node(engine: SEOAutomationEngine):
    def finalize(graph_state: GraphState) -> dict:
        state = graph_state["seo"]
        state.ready_for_cms_publish = bool(
            state.generated_article_markdown and state.schema_markup and not state.errors
        )
        engine._notify(state)
        return {"seo": state}

    return finalize