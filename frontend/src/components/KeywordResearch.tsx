"use client";

import React, { useState } from "react";
import { Copy } from "lucide-react";
import { useTool } from "@/lib/use-tool";
import type { KeywordGroups, KeywordResult } from "@/types/tools";
import { ErrorAlert, ResultCard, SingleInputForm } from "@/components/tools/ui";

/** Display order and titles of the keyword groups. */
const GROUPS: { key: keyof KeywordGroups; title: string }[] = [
  { key: "questions", title: "Questions people ask" },
  { key: "commercial", title: "Commercial intent (best, price, free...)" },
  { key: "comparisons", title: "Comparisons and alternatives" },
  { key: "other", title: "Other related searches" },
];

export default function KeywordResearch() {
  const [query, setQuery] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");
  const { data, error, loading, run } = useTool<KeywordResult>();

  async function copyAll(result: KeywordResult) {
    const text = GROUPS.flatMap(({ key }) => result.groups[key]).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("done");
    } catch {
      setCopyState("failed"); // browser blocked clipboard access
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <div className="space-y-6">
      <SingleInputForm
        description="Finds real search suggestions people type for a seed keyword. This shows ideas and intent, not search volume or difficulty."
        id="kw-seed"
        label="SEED KEYWORD"
        placeholder="e.g., ai automation"
        value={query}
        maxLength={80}
        onChange={setQuery}
        onSubmit={() => run(() => fetch(`/api/keywords?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" }))}
        loading={loading}
        disabled={query.trim().length < 2}
        buttonLabel="Find keywords"
        busyLabel="Searching..."
      />
      {error && <ErrorAlert message={error} />}
      {data && (
        <ResultCard>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-sm text-slate-300">{data.total} ideas for &ldquo;{data.query}&rdquo;</p>
            <button
              type="button"
              onClick={() => copyAll(data)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-cyan-500 text-xs font-mono flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              {copyState === "done" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy all"}
            </button>
          </div>
          {GROUPS.map(({ key, title }) =>
            data.groups[key].length > 0 ? (
              <div key={key}>
                <p className="text-xs font-mono text-slate-400 mb-2">{title.toUpperCase()} ({data.groups[key].length})</p>
                <div className="flex flex-wrap gap-2">
                  {data.groups[key].map((keyword) => (
                    <span key={keyword} className="px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </ResultCard>
      )}
    </div>
  );
}