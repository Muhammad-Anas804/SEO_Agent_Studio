"""
The readable map of the pipeline. To reorder or add an agent, edit PIPELINE.
Names and order match SEOAutomationEngine.execute_pipeline.
"""
from langgraph.graph import END, START, StateGraph

from .nodes import make_agent_node, make_finalize_node
from .state import GraphState

# (agent name shown in the audit trail, method on SEOAutomationEngine)
PIPELINE = [
    ("KeywordIntentAgent", "_intent"),
    ("SERPResearchAgent", "_serp"),
    ("CompetitorOutlineAgent", "_outline"),
    ("ContentWriterAgent", "_write"),
    ("ImagePromptAgent", "_image_prompt"),
    ("ImageGenerationAgent", "_image_generate"),
    ("TechnicalSchemaAgent", "_schema"),
    ("InternalLinkingPublisherAgent", "_links"),
    ("SEOScoreAgent", "_score"),
]


def _route(next_node: str):
    """After a node: stop early if a critical agent failed, else continue."""
    def route(graph_state: GraphState) -> str:
        return "finalize" if graph_state["halted"] else next_node
    return route


def build_graph(engine):
    g = StateGraph(GraphState)
    names = [name for name, _ in PIPELINE]

    for name, method in PIPELINE:
        g.add_node(name, make_agent_node(name, method, engine))
    g.add_node("finalize", make_finalize_node(engine))

    g.add_edge(START, names[0])
    for i, name in enumerate(names):
        if i + 1 < len(names):
            g.add_conditional_edges(name, _route(names[i + 1]), [names[i + 1], "finalize"])
        else:
            g.add_edge(name, "finalize")
    g.add_edge("finalize", END)
    return g.compile()