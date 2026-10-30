"use client";

import React, { useState } from "react";
import { Copy } from "lucide-react";

interface Groups { questions: string[]; comparisons: string[]; commercial: string[]; other: string[] }
interface Result { query: string; total: number; groups: Groups }

const LABELS: { key: keyof Groups; label: string }[] = [
  { key: "questions", label: "Questions people ask" },
  { key: "commercial", label: "Commercial intent (best, price, free...)" },
  { key: "comparisons", label: "Comparisons and alternatives" },
  { key: "other", label: "Other related searches" },
];

export default function KeywordResearch() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/keywords?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? `Request failed (${res.status})`);
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function copyAll() {
    if (!result) return;
    const all = LABELS.flatMap(({ key }) => result.groups[key]).join("\n");
    try {
      await navigator.clipboard.writeText(all);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed: your browser blocked clipboard access");
    }
  }

  const input = "w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-cyan-500 font-mono";
  return (
    <div className="space-y-6">
      <form onSubmit={run} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <p className="text-sm text-slate-400">Finds real search suggestions people type for a seed keyword. This shows ideas and intent, not search volume or difficulty.</p>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <label htmlFor="kw-seed" className="block text-xs font-mono text-slate-400 mb-2">SEED KEYWORD</label>
            <input id="kw-seed" type="text" value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="e.g., ai automation" className={input} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading || q.trim().length < 2} className="w-full md:w-40 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50">
              {loading ? "Searching..." : "Find keywords"}
            </button>
          </div>
        </div>
      </form>

      {error && <div role="alert" className="p-4 rounded-xl bg-red-950/40 border border-red-900 text-red-300 text-sm">{error}</div>}

      {result && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-sm text-slate-300">{result.total} ideas for &ldquo;{result.query}&rdquo;</p>
            <button onClick={copyAll} className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-cyan-500 text-xs font-mono flex items-center gap-1">
              <Copy className="w-3 h-3" /> {copied ? "Copied" : "Copy all"}
            </button>
          </div>
          {LABELS.map(({ key, label }) =>
            result.groups[key].length > 0 ? (
              <div key={key}>
                <p className="text-xs font-mono text-slate-400 mb-2">{label.toUpperCase()} ({result.groups[key].length})</p>
                <div className="flex flex-wrap gap-2">
                  {result.groups[key].map((k) => (
                    <span key={k} className="px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200">{k}</span>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}