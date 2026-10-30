"use client";

import React, { useEffect } from "react";
import { Check, Minus, X } from "lucide-react";

const UPGRADE_URL = process.env.NEXT_PUBLIC_UPGRADE_URL || "https://www.linkedin.com/in/buildsaiagents";

const ROWS: { label: string; free: boolean; pro: boolean }[] = [
  { label: "Full SEO article + meta title and description", free: true, pro: true },
  { label: "Search intent, outline and content gaps", free: true, pro: true },
  { label: "Article and FAQ JSON-LD schema", free: true, pro: true },
  { label: "Copy and .md download", free: true, pro: true },
  { label: "Internal link suggestions from your own pages", free: false, pro: true },
];

export default function UpgradeModal({ tier, onClose }: { tier: "free" | "pro" | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cell = (on: boolean) =>
    on ? <Check className="w-4 h-4 text-cyan-400 mx-auto" aria-label="Included" /> : <Minus className="w-4 h-4 text-slate-600 mx-auto" aria-label="Not included" />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="plans-title" className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 id="plans-title" className="text-lg font-bold">Free vs Pro</h2>
            <p className="text-xs font-mono text-slate-400 mt-1">Your current plan: {tier ? tier.toUpperCase() : "unknown"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-mono text-slate-400">
              <th className="text-left font-normal pb-2">Feature</th>
              <th className={`pb-2 w-20 ${tier === "free" ? "text-cyan-400" : ""}`}>Free</th>
              <th className={`pb-2 w-20 ${tier === "pro" ? "text-cyan-400" : ""}`}>Pro</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-t border-slate-800">
                <td className="py-2.5 pr-2 text-slate-200">{r.label}</td>
                <td>{cell(r.free)}</td>
                <td>{cell(r.pro)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {tier === "pro" ? (
          <p className="text-center text-sm font-mono text-cyan-400 py-2">You are on Pro. All features are unlocked.</p>
        ) : (
          <a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer" className="block w-full text-center py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm">
            Upgrade to Pro
          </a>
        )}
      </div>
    </div>
  );
}
