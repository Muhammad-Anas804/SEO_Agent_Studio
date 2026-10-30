"""Runs the graph with stub nodes. No API keys needed.  python -m seo_agents.graph.smoke"""
from .builder import build_graph

result = build_graph().invoke({"target_keyword": "ai automation", "revision_count": 0})
print("score:", result["seo_score"], "| revisions:", result["revision_count"])
for step in result["audit_trail"]:
    print(" ", step["agent_name"], step["status"])