"use client";

import React, { useState } from "react";
import { postJson, useTool } from "@/lib/use-tool";
import type { AuditResult } from "@/types/tools";
import { CheckList, ErrorAlert, ResultCard, ScoreHeader, SingleInputForm } from "@/components/tools/ui";

export default function WebsiteAudit() {
  const [url, setUrl] = useState("");
  const { data, error, loading, run } = useTool<AuditResult>();

  return (
    <div className="space-y-6">
      <SingleInputForm
        description="Checks the on-page SEO basics of a single public page. It does not crawl the whole site."
        id="audit-url"
        label="PAGE URL"
        placeholder="https://example.com"
        value={url}
        onChange={setUrl}
        onSubmit={() => run(() => postJson("/api/audit", { url }))}
        loading={loading}
        disabled={!url.trim()}
        buttonLabel="Run audit"
        busyLabel="Auditing..."
      />
      {error && <ErrorAlert message={error} />}
      {data && (
        <ResultCard>
          <ScoreHeader label="AUDIT SCORE" score={data.score} meta={`${data.finalUrl} | HTTP ${data.status} | ${data.ms} ms`} />
          <CheckList checks={data.checks} />
        </ResultCard>
      )}
    </div>
  );
}