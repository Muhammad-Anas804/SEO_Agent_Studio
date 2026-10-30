"use client";

import React, { useState } from "react";
import { postJson, useTool } from "@/lib/use-tool";
import type { ReadinessResult } from "@/types/tools";
import { CheckList, ErrorAlert, ResultCard, ScoreHeader, SingleInputForm } from "@/components/tools/ui";

export default function AiReadiness() {
  const [url, setUrl] = useState("");
  const { data, error, loading, run } = useTool<ReadinessResult>();

  return (
    <div className="space-y-6">
      <SingleInputForm
        description="Checks whether AI answer engines (ChatGPT, Claude, Perplexity, Google AI) can read and cite your page. This tests technical readiness. It cannot guarantee that any engine will cite you."
        id="geo-url"
        label="PAGE URL"
        placeholder="https://example.com/blog/post"
        value={url}
        onChange={setUrl}
        onSubmit={() => run(() => postJson("/api/geo", { url }))}
        loading={loading}
        disabled={!url.trim()}
        buttonLabel="Check readiness"
        busyLabel="Checking..."
      />
      {error && <ErrorAlert message={error} />}
      {data && (
        <ResultCard>
          <ScoreHeader label="AI READINESS SCORE" score={data.score} meta={data.finalUrl} />
          <div className="flex flex-wrap gap-2">
            {data.bots.map((b) => (
              <span
                key={b.bot}
                className={`px-3 py-1 rounded-full border text-xs font-mono ${b.blocked ? "border-red-900 text-red-300" : "border-emerald-900 text-emerald-300"}`}
              >
                {b.bot}: {b.blocked ? "blocked" : "allowed"}
              </span>
            ))}
          </div>
          <CheckList checks={data.checks} />
        </ResultCard>
      )}
    </div>
  );
}