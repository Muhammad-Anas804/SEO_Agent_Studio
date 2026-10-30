"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { postJson, useTool } from "@/lib/use-tool";
import type { BacklinkResult } from "@/types/tools";
import { ErrorAlert, Field, ResultCard, SubmitButton, ToolForm, inputClass } from "@/components/tools/ui";

const splitLines = (text: string): string[] => text.split("\n").map((line) => line.trim()).filter(Boolean);

export default function BacklinkAnalysis() {
  const [target, setTarget] = useState("");
  const [urls, setUrls] = useState("");
  const { data, error, loading, run } = useTool<BacklinkResult>();

  const liveCount = data?.results.filter((r) => r.found).length ?? 0;

  return (
    <div className="space-y-6">
      <ToolForm
        description="Verifies backlinks you already know about: paste pages that should link to you and see whether each link is live, its anchor text, and whether it is nofollow. It does not discover new backlinks, which needs a link-index data provider."
        onSubmit={() => run(() => postJson("/api/backlinks", { target, urls: splitLines(urls) }))}
      >
        <Field id="bl-target" label="YOUR DOMAIN">
          <input id="bl-target" type="text" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="yoursite.com" className={inputClass} />
        </Field>
        <Field id="bl-urls" label="PAGES THAT SHOULD LINK TO YOU (ONE PER LINE, MAX 10)">
          <textarea
            id="bl-urls"
            rows={5}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={"https://blog.example.org/some-post\nhttps://directory.example.com/listing"}
            className={inputClass}
          />
        </Field>
        <SubmitButton loading={loading} disabled={!target.trim() || !urls.trim()} label="Check backlinks" busyLabel="Checking..." />
      </ToolForm>

      {error && <ErrorAlert message={error} />}

      {data && (
        <ResultCard>
          <p className="text-sm text-slate-300">{liveCount} of {data.results.length} pages link to your domain.</p>
          {data.results.map((page) => (
            <div key={page.url} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex gap-2 items-start">
                {page.found
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-label="Link found" />
                  : <XCircle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" aria-label="No link found" />}
                <p className="text-sm font-mono break-all">{page.url}</p>
              </div>
              {page.error && <p className="text-xs font-mono text-amber-300">{page.error}</p>}
              {!page.error && !page.found && (
                <p className="text-xs font-mono text-slate-400">
                  No link to your domain found (HTTP {page.status}). If the page builds links with JavaScript, this check cannot see them.
                </p>
              )}
              {page.links.map((link, i) => (
                <div key={i} className="ml-6 text-xs font-mono space-y-0.5">
                  <p className="text-cyan-400">Anchor: &ldquo;{link.anchor}&rdquo;</p>
                  <p className="text-slate-300 break-all">{link.href}</p>
                  <p className={link.nofollow ? "text-amber-300" : "text-emerald-400"}>
                    {link.nofollow ? `Not passing link value (rel="${link.rel}")` : "Followed link"}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </ResultCard>
      )}
    </div>
  );
}