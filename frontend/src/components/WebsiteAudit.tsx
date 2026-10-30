"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

interface Check { name: string; pass: boolean; detail: string }
interface Result { finalUrl: string; status: number; ms: number; score: number; checks: Check[] }

export default function WebsiteAudit() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? `Request failed (${res.status})`);
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  }

  const input = "w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-cyan-500 font-mono";
  return (
    <div className="space-y-6">
      <form onSubmit={run} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <p className="text-sm text-slate-400">Checks the on-page SEO basics of a single public page. It does not crawl the whole site.</p>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <label htmlFor="audit-url" className="block text-xs font-mono text-slate-400 mb-2">PAGE URL</label>
            <input id="audit-url" type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className={input} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading || !url.trim()} className="w-full md:w-40 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50">
              {loading ? "Auditing..." : "Run audit"}
            </button>
          </div>
        </div>
      </form>

      {error && <div role="alert" className="p-4 rounded-xl bg-red-950/40 border border-red-900 text-red-300 text-sm">{error}</div>}

      {result && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs font-mono text-slate-400">AUDIT SCORE</p>
              <p className="text-4xl font-bold">{result.score} / 100</p>
            </div>
            <p className="text-xs font-mono text-slate-500 break-all">{result.finalUrl} &middot; HTTP {result.status} &middot; {result.ms} ms</p>
          </div>
          <ul className="space-y-2">
            {result.checks.map((c) => (
              <li key={c.name} className="flex gap-3 items-start p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm">
                {c.pass ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />}
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs font-mono text-slate-400 break-words">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}