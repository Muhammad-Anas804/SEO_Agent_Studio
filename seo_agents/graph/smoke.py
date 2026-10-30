"""Offline check with stub agents, no API keys.   python -m seo_agents.graph.smoke"""
from seo_agents.State import SEOState
from seo_agents.seo_brain import SEOAutomationEngine

from .builder import PIPELINE, build_graph


class StubEngine(SEOAutomationEngine):
    pass


for _name, _method in PIPELINE:
    setattr(StubEngine, _method, lambda self, state: ("SUCCESS", "stub"))


def main() -> None:
    graph = build_graph(StubEngine())
    state = SEOState(run_id="smoke", target_keyword="ai automation")
    result = graph.invoke({"seo": state, "halted": False})["seo"]
    for step in result.audit_trail:
        print(f"  {step.agent_name:32} {step.status}")
    print("errors:", result.errors)
    print("\n" + graph.get_graph().draw_mermaid())


if __name__ == "__main__":
    main()