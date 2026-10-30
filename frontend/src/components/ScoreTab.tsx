import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { SEOReport } from "@/types/seo";

export default function ScoreTab({ report }: { report?: SEOReport | null }) {
  if (!report) return <p className="text-sm text-slate-400 font-mono">No score available for this run.</p>;
  const color = report.score >= 80 ? "text-emerald-400" : report.score >= 60 ? "text-amber-400" : "text-red-400";
  const label = report.score >= 80 ? "Strong" : report.score >= 60 ? "Needs polish" : "Needs work";
  const failed = report.checks.filter((c) => !c.passed);

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-4">
        <span className={`text-6xl font-bold ${color}`}>{report.score}</span>
        <div className="pb-2 font-mono text-xs text-slate-400">
          <p className="text-slate-200 text-sm">/ 100 &middot; {label}</p>
          <p>{report.checks.length - failed.length} of {report.checks.length} checks passed</p>
        </div>
      </div>
      <ul className="space-y-2">
        {[...failed, ...report.checks.filter((c) => c.passed)].map((c) => (
          <li key={c.name} className="flex gap-3 items-start p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm">
            {c.passed ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-label="Passed" /> : <XCircle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" aria-label="Failed" />}
            <div>
              <p className="text-slate-200">{c.name}</p>
              <p className="text-xs font-mono text-slate-500">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">Automatic on-page checks. They help, but they don&apos;t guarantee rankings.</p>
    </div>
  );
}
