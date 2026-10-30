import React from "react";
import { Trash2 } from "lucide-react";
import type { RunSummary } from "@/types/seo";

const DOT: Record<string, string> = {
  completed: "bg-emerald-400",
  partial: "bg-amber-400",
  failed: "bg-red-400",
  running: "bg-cyan-400 animate-pulse",
  queued: "bg-cyan-400 animate-pulse",
};

interface Props {
  runs: RunSummary[];
  activeId?: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function HistoryPanel({ runs, activeId, onOpen, onDelete }: Props) {
  if (runs.length === 0) return <p className="text-sm text-slate-400 font-mono">No runs yet. Your finished articles will appear here.</p>;
  return (
    <ul className="divide-y divide-slate-800">
      {runs.map((r) => (
        <li key={r.run_id} className={`flex items-center gap-3 py-2.5 ${r.run_id === activeId ? "bg-slate-950/60" : ""}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[r.status] ?? "bg-slate-500"}`} title={r.status} />
          <button type="button" onClick={() => onOpen(r.run_id)} className="flex-1 text-left min-w-0">
            <p className="text-sm text-slate-200 truncate">{r.keyword}</p>
            <p className="text-xs font-mono text-slate-500">{new Date(r.created_at).toLocaleString()} &middot; {r.status}</p>
          </button>
          <button type="button" onClick={() => onDelete(r.run_id)} aria-label={`Delete ${r.keyword}`} className="text-slate-500 hover:text-red-400 p-1">
            <Trash2 className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
