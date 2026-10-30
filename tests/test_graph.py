from typing import Optional

from seo_agents.State import SEOState
from seo_agents.graph.builder import PIPELINE, build_graph
from seo_agents.seo_brain import CRITICAL_AGENTS, SEOAutomationEngine

NAMES = [n for n, _ in PIPELINE]


def make_engine(fail: Optional[str] = None) -> SEOAutomationEngine:
    """Engine whose agents are stubs; the agent named `fail` raises."""
    class Stub(SEOAutomationEngine):
        pass

    for name, method in PIPELINE:
        def step(self, state, _name=name):
            if _name == fail:
                raise RuntimeError("boom")
            return "SUCCESS", "stub"
        setattr(Stub, method, step)
    return Stub()


def new_state(run_id: str = "t") -> SEOState:
    return SEOState(run_id=run_id, target_keyword="ai automation")


def run_graph(engine) -> SEOState:
    return build_graph(engine).invoke({"seo": new_state(), "halted": False})["seo"]


def test_runs_every_agent_in_order():
    state = run_graph(make_engine())
    assert [a.agent_name for a in state.audit_trail] == NAMES
    assert state.errors == []


def test_critical_failure_stops_the_pipeline():
    critical = next(n for n in NAMES if n in CRITICAL_AGENTS)
    state = run_graph(make_engine(fail=critical))
    assert state.audit_trail[-1].agent_name == critical
    assert state.audit_trail[-1].status == "FAILED"
    assert len(state.audit_trail) < len(NAMES)
    assert state.errors


def test_non_critical_failure_continues():
    other = next(n for n in NAMES if n not in CRITICAL_AGENTS)
    state = run_graph(make_engine(fail=other))
    assert len(state.audit_trail) == len(NAMES)
    assert next(a for a in state.audit_trail if a.agent_name == other).status == "FAILED"


def test_matches_legacy_engine():
    legacy = make_engine().execute_pipeline(new_state("legacy"))
    graph = run_graph(make_engine())
    assert [(a.agent_name, a.status) for a in legacy.audit_trail] == [(a.agent_name, a.status) for a in graph.audit_trail]
    assert legacy.ready_for_cms_publish == graph.ready_for_cms_publish