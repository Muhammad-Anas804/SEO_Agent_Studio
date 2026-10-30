"use client";

import React, { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  Code,
  Copy,
  Cpu,
  Download,
  FileText,
  Gauge,
  History,
  Link2,
  Search,
  Send,
  Settings,
  Terminal,
  XCircle,
} from "lucide-react";
import type { RunRecord, RunStatus, RunSummary, UsageInfo } from "@/types/seo";
import UpgradeModal from "@/components/UpgradeModal";
import ScoreTab from "@/components/ScoreTab";
import HistoryPanel from "@/components/HistoryPanel";
import CompetitorsTab from "@/components/CompetitorsTab";
import AISettings from "@/components/AISettings";
import KnowledgeBase from "@/components/KnowledgeBase";
import AppShell from "@/components/AppShell";
import Overview from "@/components/Overview";
import { ToolView, type View } from "@/components/tools/registry";

type Tab = "article" | "score" | "competitors" | "meta" | "schema" | "links" | "logs";

const ACTIVE: RunStatus[] = ["queued", "running"];
const TONES = ["professional", "conversational", "friendly", "authoritative", "persuasive", "technical"];
const LENGTHS = [800, 1200, 1500, 2000, 2500];

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d: unknown) => (typeof d === "string" ? d : (d as { msg?: string }).msg ?? "Invalid input")).join("; ");
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [url, setUrl] = useState("");
  const [paths, setPaths] = useState("");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState(1500);
  const [language, setLanguage] = useState("English");
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("article");
  const [copied, setCopied] = useState<string | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showKB, setShowKB] = useState(false);
  const [view, setView] = useState<View>("overview");

  const runId = run?.run_id;
  const active = run ? ACTIVE.includes(run.status) : false;
  const tier = usage?.tier ?? null;
  const limitReached = usage ? usage.used_today >= usage.daily_limit : false;

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      if (res.ok) setUsage(await res.json());
    } catch {
      /* usage is informational */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/seo", { cache: "no-store" });
      if (res.ok) setHistory(await res.json());
    } catch {
      /* ignore */
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadUsage();
    loadHistory();
  }, [loadUsage, loadHistory]);

  // Refresh usage and history whenever a run finishes.
  useEffect(() => {
    if (runId && !active) {
      loadUsage();
      loadHistory();
    }
  }, [runId, active, loadUsage, loadHistory]);

  // Poll the run while the background pipeline is working.
  useEffect(() => {
    if (!runId || !active) return;
    let misses = 0;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/seo/${runId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await readError(res));
        misses = 0;
        setRun(await res.json());
      } catch (err) {
        if (++misses >= 5) {
          setError(err instanceof Error ? err.message : "Lost connection to the server");
          clearInterval(timer);
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [runId, active]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim() || submitting || active) return;
    setSubmitting(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch("/api/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_keyword: keyword,
          target_url: url,
          site_paths: paths.split("\n").map((p) => p.trim()).filter(Boolean),
          tone,
          word_count_target: length,
          language,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setRun(await res.json());
      setTab("article");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function openRun(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/seo/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      setRun(await res.json());
      setTab("article");
      setShowHistory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that run");
    }
  }

  async function deleteRun(id: string) {
    if (!window.confirm("Delete this run permanently?")) return;
    try {
      const res = await fetch(`/api/seo/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await readError(res));
      if (id === runId) setRun(null);
      loadHistory();
      loadUsage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the run");
    }
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Copy failed: your browser blocked clipboard access");
    }
  }

  const data = run?.data ?? null;
  const score = data?.seo_report?.score;
  const input = "w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-cyan-500 font-mono";
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "article", label: "Article", icon: <FileText className="w-4 h-4" /> },
    { id: "score", label: score !== undefined ? `SEO Score (${score})` : "SEO Score", icon: <Gauge className="w-4 h-4" /> },
    { id: "competitors", label: "Competitors", icon: <Search className="w-4 h-4" /> },
    { id: "meta", label: "Strategy & Meta", icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: "schema", label: "JSON-LD", icon: <Code className="w-4 h-4" /> },
    { id: "links", label: `Internal Links (${data?.internal_links.length ?? 0})`, icon: <Link2 className="w-4 h-4" /> },
    { id: "logs", label: "Telemetry", icon: <Terminal className="w-4 h-4" /> },
  ];

  return (
    <AppShell view={view} onNavigate={setView} tier={tier} usage={usage} historyCount={history.length} onOpenAI={() => setShowAI(true)} onOpenKB={() => setShowKB(true)} onToggleHistory={() => setShowHistory((v) => !v)} onOpenPlans={() => setShowPlans(true)}>
      <div className="max-w-6xl mx-auto space-y-6">
        {showAI && <AISettings onClose={() => setShowAI(false)} />}
        {showKB && <KnowledgeBase onClose={() => setShowKB(false)} />}
        {showPlans && <UpgradeModal tier={tier} onClose={() => setShowPlans(false)} />}

        {view === "overview" && (
          <Overview runs={historyLoaded ? history : null} usage={usage} onNewArticle={() => setView("studio")} onOpenRun={(id) => { setView("studio"); openRun(id); }} />
        )}


        <ToolView view={view} />

        <div className={view === "studio" ? "space-y-6" : "hidden"}>
        {showHistory && (
          <section aria-label="Run history" className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <HistoryPanel runs={history} activeId={runId} onOpen={openRun} onDelete={deleteRun} />
          </section>
        )}

        <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-7">
              <label htmlFor="kw" className="block text-xs font-mono text-slate-400 mb-2">TARGET KEYWORD</label>
              <input id="kw" type="text" value={keyword} maxLength={120} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g., portfolio website for developers" className={input} />
            </div>
            <div className="md:col-span-3">
              <label htmlFor="url" className="block text-xs font-mono text-slate-400 mb-2">ARTICLE URL (OPTIONAL)</label>
              <input id="url" type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yoursite.com/blog/post" className={input} />
            </div>
            <div className="md:col-span-2 flex items-end">
              <button type="submit" disabled={submitting || active || limitReached || !keyword.trim()} className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                {submitting || active ? "Running..." : limitReached ? "Limit reached" : "Run Pipeline"} <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="tone" className="block text-xs font-mono text-slate-400 mb-2">TONE</label>
              <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} className={input}>
                {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="len" className="block text-xs font-mono text-slate-400 mb-2">LENGTH</label>
              <select id="len" value={length} onChange={(e) => setLength(Number(e.target.value))} className={input}>
                {LENGTHS.map((n) => <option key={n} value={n}>about {n} words</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lang" className="block text-xs font-mono text-slate-400 mb-2">LANGUAGE</label>
              <input id="lang" type="text" value={language} maxLength={30} onChange={(e) => setLanguage(e.target.value)} placeholder="English" className={input} />
            </div>
          </div>

          <div>
            <label htmlFor="paths" className="block text-xs font-mono text-slate-400 mb-2">
              EXISTING SITE PAGES FOR INTERNAL LINKS (OPTIONAL, ONE PATH PER LINE{tier === "free" ? ", PRO ONLY" : ""})
            </label>
            <textarea id="paths" value={paths} onChange={(e) => setPaths(e.target.value)} rows={3} placeholder={"/pricing\n/blog/what-is-seo"} className={input} />
          </div>
        </form>

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-red-950/40 border border-red-900 text-red-300 text-sm flex gap-2 items-start">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {run && active && (
          <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
            <div className="text-center space-y-2">
              <Cpu className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <p className="text-sm font-mono text-slate-400">Agents are working... this usually takes under a minute.</p>
            </div>
            <ul className="max-w-md mx-auto space-y-1 font-mono text-xs">
              {(data?.audit_trail ?? []).map((l, i) => (
                <li key={i} className="flex justify-between text-slate-300">
                  <span>{l.agent_name}</span>
                  <span className={l.status === "FAILED" ? "text-red-400" : "text-cyan-400"}>{l.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {run && !active && run.status !== "completed" && (
          <div role="alert" className="p-4 rounded-xl bg-amber-950/30 border border-amber-900 text-amber-200 text-sm flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">{run.status === "failed" ? "The run failed." : "The run finished with problems."}</p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">{(data?.errors ?? []).map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          </div>
        )}

        {data && !active && data.warnings.length > 0 && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono space-y-1">
            {data.warnings.map((w, i) => <p key={i}>Warning: {w}</p>)}
          </div>
        )}

        {data && !active && data.generated_article_markdown && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex flex-wrap border-b border-slate-800 bg-slate-950/50 p-2 gap-2" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-xs font-mono flex items-center gap-2 ${tab === t.id ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {tab === "article" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 items-center justify-between text-xs font-mono text-slate-400">
                    <span>{data.estimated_read_time_minutes} min read &middot; {data.tone} &middot; {data.language}</span>
                    <span className="flex flex-wrap gap-2">
                      <button onClick={() => copy("article", data.generated_article_markdown ?? "")} className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-cyan-500 flex items-center gap-1"><Copy className="w-3 h-3" /> {copied === "article" ? "Copied" : "Copy"}</button>
                      {(["html", "md", "json"] as const).map((f) => (
                        <a key={f} href={`/api/seo/${data.run_id}/export?format=${f}`} download className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-cyan-500 flex items-center gap-1"><Download className="w-3 h-3" /> .{f}</a>
                      ))}
                    </span>
                  </div>
                  <div className="prose max-w-none"><ReactMarkdown>{data.generated_article_markdown}</ReactMarkdown></div>
                </div>
              )}

              {tab === "score" && <ScoreTab report={data.seo_report} />}

              {tab === "competitors" && <CompetitorsTab serp={data.serp} tier={tier} />}

              {tab === "meta" && (
                <div className="space-y-5 text-sm">
                  <Field label={`Meta title (${data.meta_title?.length ?? 0}/60)`} value={data.meta_title} onCopy={() => copy("title", data.meta_title ?? "")} copied={copied === "title"} />
                  <Field label={`Meta description (${data.meta_description?.length ?? 0}/160)`} value={data.meta_description} onCopy={() => copy("desc", data.meta_description ?? "")} copied={copied === "desc"} />
                  <Field label="Search intent" value={data.search_intent} />
                  <Field label="Target audience" value={data.target_audience} />
                  <List label="Related keywords" items={data.lsi_keywords} />
                  <List label="Outline" items={data.content_outline} />
                  <List label="Content gaps" items={data.content_gap_insights} />
                </div>
              )}

              {tab === "schema" && (
                <div className="space-y-6">
                  <CodeBlock label="Article" json={data.schema_markup?.json_ld_article} onCopy={copy} copied={copied} />
                  <CodeBlock label="FAQ" json={data.schema_markup?.json_ld_faq} onCopy={copy} copied={copied} />
                </div>
              )}

              {tab === "links" && (
                <div className="space-y-3 font-mono text-xs">
                  {data.internal_links.length === 0 && (
                    <p className="text-slate-400">No internal links. Link suggestions need the Pro plan and a list of your existing site pages.</p>
                  )}
                  {data.internal_links.map((l, i) => (
                    <div key={i} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <p className="text-cyan-400">Anchor: &ldquo;{l.anchor_text}&rdquo;</p>
                      <p className="text-slate-300">Path: {l.target_path}</p>
                      <p className="text-slate-500">{l.context_sentence}</p>
                    </div>
                  ))}
                </div>
              )}

              {tab === "logs" && (
                <div className="space-y-2 font-mono text-xs">
                  {data.ai_usage.length > 0 && (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <p className="text-slate-200 font-bold">AI models used</p>
                      {data.ai_usage.map((u, i) => (
                        <p key={i} className={u.fallback_used ? "text-amber-300" : "text-slate-400"}>
                          {u.step}: {u.provider}/{u.model} &middot; {u.attempts} attempt(s){u.fallback_used ? " \u00b7 fallback used" : ""}
                        </p>
                      ))}
                    </div>
                  )}
                  {data.audit_trail.map((l, i) => (
                    <div key={i} className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                      <div className="flex justify-between">
                        <span className="text-slate-200 font-bold">{l.agent_name}</span>
                        <span className={l.status === "FAILED" ? "text-red-400" : "text-cyan-400"}>{l.status} &middot; {l.execution_time_ms} ms</span>
                      </div>
                      {l.details && <p className="text-slate-500 mt-1">{l.details}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onCopy, copied }: { label: string; value?: string | null; onCopy?: () => void; copied?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
        <span>{label}</span>
        {onCopy && <button onClick={onCopy} className="hover:text-cyan-400">{copied ? "Copied" : "Copy"}</button>}
      </div>
      <p className="p-3 bg-slate-950 border border-slate-800 rounded-xl">{value || "-"}</p>
    </div>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-mono text-slate-400 mb-1">{label}</p>
      <ul className="list-disc pl-5 space-y-0.5 text-slate-300">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}

function CodeBlock({ label, json, onCopy, copied }: { label: string; json?: string | null; onCopy: (l: string, t: string) => void; copied: string | null }) {
  if (!json) return null;
  return (
    <div>
      <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
        <span>{label} JSON-LD</span>
        <button onClick={() => onCopy(label, `<script type="application/ld+json">\n${json}\n</script>`)} className="hover:text-cyan-400">{copied === label ? "Copied" : "Copy as <script>"}</button>
      </div>
      <pre className="p-4 bg-slate-950 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto">{json}</pre>
    </div>
  );
}
