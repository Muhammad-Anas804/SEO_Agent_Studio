import React from "react";
import type { SERPData } from "@/types/seo";

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function CompetitorsTab({ serp, tier }: { serp?: SERPData | null; tier: "free" | "pro" | null }) {
  if (!serp) {
    return (
      <p className="text-sm text-slate-400 font-mono">
        {tier === "free"
          ? "Real competitor research is a Pro feature. Upgrade to see the top Google results for your keyword."
          : "No competitor data for this run. Add a SERPER_API_KEY on the server to turn this on."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono text-slate-400 mb-2">TOP GOOGLE RESULTS{serp.cached ? " (cached)" : ""}</p>
        <ol className="space-y-3">
          {serp.results.map((r) => (
            <li key={r.url} className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex gap-3">
              <span className="text-cyan-400 font-mono text-sm w-6 shrink-0">{r.position}</span>
              <div className="min-w-0">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-slate-100 hover:text-cyan-400 text-sm font-semibold break-words">{r.title || r.url}</a>
                <p className="text-xs font-mono text-emerald-400 truncate">{host(r.url)}</p>
                {r.snippet && <p className="text-xs text-slate-400 mt-1">{r.snippet}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {serp.people_also_ask.length > 0 && (
        <div>
          <p className="text-xs font-mono text-slate-400 mb-2">PEOPLE ALSO ASK</p>
          <ul className="space-y-2">
            {serp.people_also_ask.map((q) => (
              <li key={q.question} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm">
                <p className="text-slate-200">{q.question}</p>
                {q.answer && <p className="text-xs text-slate-500 mt-1">{q.answer}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {serp.related_searches.length > 0 && (
        <div>
          <p className="text-xs font-mono text-slate-400 mb-2">RELATED SEARCHES</p>
          <div className="flex flex-wrap gap-2">
            {serp.related_searches.map((s) => (
              <span key={s} className="px-3 py-1 rounded-full border border-slate-700 text-xs font-mono text-slate-300">{s}</span>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">Based on Google result titles and snippets. Full competitor pages are not analysed.</p>
    </div>
  );
}
