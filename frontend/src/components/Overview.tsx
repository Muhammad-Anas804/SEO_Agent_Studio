"use client";

import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { RunRecord, RunSummary, UsageInfo } from "@/types/seo";

interface Props {
  runs: RunSummary[] | null;
  usage: UsageInfo | null;
  onNewArticle: () => void;
  onOpenRun: (id: string) => void;
}

const STATUS_STYLE: Record<string, string> = {
  completed: "text-emerald-400",
  partial: "text-amber-300",
  failed: "text-red-400",
  running: "text-cyan-400",
  queued: "text-cyan-400",
};

function scoreColor(score: number): string {
  return score >= 80 ? "bg-emerald-400" : score >= 60 ? "bg-amber-400" : "bg-red-400";
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl shadow-card">
      <p className="text-xs font-mono text-slate-400">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {note && <p className="text-xs text-slate-500 mt-1">{note}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="p-5 bg-slate-900 border border-slate-800 rounded-xl shadow-card">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function Overview({ runs, usage, onNewArticle, onOpenRun }: Props) {
  const [latest, setLatest] = useState<RunRecord | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const latestId = runs?.find((r) => r.status === "completed" || r.status === "partial")?.run_id;

  useEffect(() => {
    if (!latestId) {
      setLatest(null);
      return;
    }
    let cancelled = false;
    setLoadingLatest(true);
    fetch(`/api/seo/${latestId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setLatest(d);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingLatest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [latestId]);

  if (runs === null) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />)}
        </div>
        <div className="h-48 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="p-10 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-3">
        <h2 className="text-lg font-semibold">No articles yet</h2>
        <p className="text-sm text-slate-400">Write your first article and this page will show its SEO score, the issues to fix, and how each AI agent performed.</p>
        <button type="button" onClick={onNewArticle} className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg text-sm">Write an article</button>
      </div>
    );
  }

  const finished = runs.filter((r) => r.status === "completed" || r.status === "partial" || r.status === "failed");
  const succeeded = finished.filter((r) => r.status === "completed").length;
  const scored = runs.filter((r) => typeof r.score === "number").slice(0, 10).reverse();
  const newest = scored.length > 0 ? (scored[scored.length - 1].score as number) : undefined;
  const issues = (latest?.data?.seo_report?.checks ?? []).filter((c) => !c.passed).sort((a, b) => b.weight - a.weight).slice(0, 6);
  const trail = latest?.data?.audit_trail ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">What happened in your recent articles, what to fix next, and how the agents performed.</p>
        <button type="button" onClick={onNewArticle} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" aria-hidden="true" /> Write a new article
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="LATEST SEO SCORE" value={newest !== undefined ? `${newest} / 100` : "n/a"} note="from your most recent scored article" />
        <Metric label="RECENT ARTICLES" value={String(runs.length)} note="last 20 runs" />
        <Metric label="COMPLETED WITHOUT ERRORS" value={finished.length > 0 ? `${succeeded} of ${finished.length}` : "n/a"} />
        <Metric label="RUNS TODAY" value={usage ? `${usage.used_today} / ${usage.daily_limit}` : "n/a"} note={usage ? `${usage.tier} plan` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="SEO score over your recent articles">
          {scored.length < 2 ? (
            <p className="text-sm text-slate-400">The chart appears after at least two scored articles.</p>
          ) : (
            <div className="flex items-end gap-2 h-36" role="img" aria-label={`SEO scores: ${scored.map((r) => r.score).join(", ")}`}>
              {scored.map((r) => (
                <div key={r.run_id} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${r.keyword}: ${r.score}`}>
                  <span className="text-[10px] font-mono text-slate-400">{r.score}</span>
                  <div className={`w-full rounded-t ${scoreColor(r.score as number)}`} style={{ height: `${Math.max(4, r.score as number)}%` }} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Priority issues in your latest article">
          {loadingLatest ? (
            <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-10 rounded bg-slate-950 animate-pulse" />)}</div>
          ) : issues.length === 0 ? (
            <p className="text-sm text-slate-400">{latest ? "No failed checks. Nothing urgent to fix." : "No scored article yet."}</p>
          ) : (
            <ul className="space-y-2">
              {issues.map((c) => (
                <li key={c.name} className="flex items-start gap-3 text-sm">
                  <span className={`mt-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded border ${c.weight >= 10 ? "border-red-900 text-red-300 bg-red-950" : "border-amber-900 text-amber-300 bg-amber-950"}`}>{c.weight >= 10 ? "HIGH" : "MEDIUM"}</span>
                  <div>
                    <p className="text-slate-200">{c.name}</p>
                    <p className="text-xs font-mono text-slate-500">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {latest && <p className="text-xs text-slate-500 mt-3">Found by automatic rule checks on &ldquo;{latest.keyword}&rdquo;.</p>}
        </Card>

        <Card title="AI agent activity (latest article)">
          {trail.length === 0 ? (
            <p className="text-sm text-slate-400">No agent data yet.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {trail.map((a, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span>{a.agent_name}</span>
                  <span className={`text-xs font-mono ${a.status === "FAILED" ? "text-red-400" : a.status === "SKIPPED" ? "text-slate-500" : "text-emerald-400"}`}>{a.status} &middot; {Math.round(a.execution_time_ms / 100) / 10}s</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity">
          <ul className="divide-y divide-slate-800">
            {runs.slice(0, 8).map((r) => (
              <li key={r.run_id}>
                <button type="button" onClick={() => onOpenRun(r.run_id)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-slate-950 rounded px-1">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{r.keyword}</span>
                    <span className="block text-xs font-mono text-slate-500">{new Date(r.created_at).toLocaleString()}</span>
                  </span>
                  <span className={`text-xs font-mono ${STATUS_STYLE[r.status] ?? "text-slate-400"}`}>{r.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
