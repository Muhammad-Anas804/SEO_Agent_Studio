"""State that flows through the graph."""
from typing import TypedDict

from seo_agents.State import SEOState


class GraphState(TypedDict):
    seo: SEOState   # the same model the API stores and returns
    halted: bool    # set when a critical agent fails: skip straight to finalize