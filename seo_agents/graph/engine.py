"""
Drop-in replacement for SEOAutomationEngine (same constructor, same
execute_pipeline). Choose the engine with the PIPELINE_ENGINE variable:
    legacy (default)  -> the original loop
    langgraph         -> the LangGraph version
"""
import logging
import os
from typing import Callable, Optional

from seo_agents.State import SEOState
from seo_agents.seo_brain import SEOAutomationEngine

from .builder import build_graph

logger = logging.getLogger("seo_agents.graph")


class LangGraphEngine:
    def __init__(self, is_pro: bool = False, on_progress: Optional[Callable[[SEOState], None]] = None):
        self._agents = SEOAutomationEngine(is_pro=is_pro, on_progress=on_progress)

    def execute_pipeline(self, state: SEOState) -> SEOState:
        logger.info("Starting pipeline run_id=%s engine=langgraph", state.run_id)
        result = build_graph(self._agents).invoke({"seo": state, "halted": False})
        return result["seo"]


def create_engine(is_pro: bool = False, on_progress: Optional[Callable[[SEOState], None]] = None):
    if os.getenv("PIPELINE_ENGINE", "legacy").strip().lower() == "langgraph":
        return LangGraphEngine(is_pro=is_pro, on_progress=on_progress)
    return SEOAutomationEngine(is_pro=is_pro, on_progress=on_progress)