"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

interface Link { href: string; anchor: string; rel: string; nofollow: boolean }
interface Item { url: string; status: number; found: boolean; links: Link[]; error: string | null }

export default function BacklinkAnalysis() {
  const [target, setTarget] = useState("");
  const [urls, setUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Item[] | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/backlinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, urls: urls.split("\n").map((u) => u.trim()).filter(Boolean) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? `Request failed (${res.status})`);
      setResults(body.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }

  const input = "w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-cyan-500 font-mono";
  const live = results?.filter((r) => r.found).length ?? 0;
  return (
    <div className="space-y-6">
      <form onSubmit={run} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <p className="text-sm text-slate-400">Verifies backlinks you already know about: paste pages that should link to you and see whether each link is live, its anchor text, and whether it is nofollow. It does not discover new backlinks, which needs a link-index data provider.</p>
        <div>
          <label htmlFor="bl-target" className="block text-xs font-mono text-slate-400 mb-2">YOUR DOMAIN</label>
          <input id="bl-target" type="text" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="yoursite.com" className={input} />
        </div>
        <div>
          <label htmlFor="bl-urls" className="block text-xs font-mono text-slate-400 mb-2">PAGES THAT SHOULD LINK TO YOU (ONE PER LINE, MAX 10)</label>
          <textarea id="bl-urls" rows={5} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={"https://blog.example.org/some-post\nhttps://directory.example.com/listing"} className={input} />
        </div>
        <button type="submit" disabled={loading || !target.trim() || !urls.trim()} className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50">
          {loading ? "Checking..." : "Check backlinks"}
        </button>
      </form>

      {error && <div role="alert" className="p-4 rounded-xl bg-red-950/40 border border-red-900 text-red-300 text-sm">{error}</div>}

      {results && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <p className="text-sm text-slate-300">{live} of {results.length} pages link to your domain.</p>
          {results.map((r) => (
            <div key={r.url} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex gap-2 items-start">
                {r.found ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />}
                <p className="text-sm font-mono break-all">{r.url}</p>
              </div>
              {r.error && <p className="text-xs font-mono text-amber-300">{r.error}</p>}
              {!r.error && !r.found && <p className="text-xs font-mono text-slate-400">No link to your domain found (HTTP {r.status}). If the page builds links with JavaScript, this check cannot see them.</p>}
              {r.links.map((l, i) => (
                <div key={i} className="ml-6 text-xs font-mono space-y-0.5">
                  <p className="text-cyan-400">Anchor: &ldquo;{l.anchor}&rdquo;</p>
                  <p className="text-slate-300 break-all">{l.href}</p>
                  <p className={l.nofollow ? "text-amber-300" : "text-emerald-400"}>{l.nofollow ? `Not passing link value (rel="${l.rel}")` : "Followed link"}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}