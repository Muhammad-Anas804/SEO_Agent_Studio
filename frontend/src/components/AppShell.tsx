"use client";

import React, { useState } from "react";
import { BookOpen, Bot, FileText, Globe, History, LayoutDashboard, Link2, Menu, Search, Settings, X } from "lucide-react";
import type { UsageInfo } from "@/types/seo";

type View = "overview" | "studio";

interface Props {
  children: React.ReactNode;
  view: View;
  onNavigate: (view: View) => void;
  tier: "free" | "pro" | null;
  usage: UsageInfo | null;
  historyCount: number;
  onOpenAI: () => void;
  onOpenKB: () => void;
  onToggleHistory: () => void;
  onOpenPlans: () => void;
}

// Only features that exist are clickable. The rest are shown honestly as not available yet.
const SOON = [
  { label: "Website Audits", icon: Globe },
  { label: "Keyword Research", icon: Search },
  { label: "Backlink Analysis", icon: Link2 },
];

const VIEWS = [
  { id: "overview" as View, label: "Overview", icon: LayoutDashboard },
  { id: "studio" as View, label: "Article Studio", icon: FileText },
];

export default function AppShell({ children, view, onNavigate, tier, usage, historyCount, onOpenAI, onOpenKB, onToggleHistory, onOpenPlans }: Props) {
  const [open, setOpen] = useState(false);
  const limitReached = usage ? usage.used_today >= usage.daily_limit : false;

  const item = "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-cyan-500 focus:text-slate-950">Skip to content</a>

      {open && <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside aria-label="Main navigation" className={`fixed inset-y-0 left-0 z-40 w-60 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform motion-reduce:transition-none ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800">
          <div className="flex items-center gap-2 font-bold tracking-tight">
            <Bot className="w-6 h-6 text-cyan-500" aria-hidden="true" /> SEO Agent Studio
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="lg:hidden text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={run(() => onNavigate(id))} aria-current={view === id ? "page" : undefined} className={`${item} ${view === id ? "bg-cyan-950 text-cyan-400 font-semibold" : "text-slate-300 hover:bg-slate-950"}`}>
              <Icon className="w-4 h-4" aria-hidden="true" /> {label}
            </button>
          ))}
          <button type="button" onClick={run(() => { onNavigate("studio"); onToggleHistory(); })} className={`${item} text-slate-300 hover:bg-slate-950`}>
            <History className="w-4 h-4" aria-hidden="true" /> History
            <span className="ml-auto text-xs font-mono text-slate-400">{historyCount}</span>
          </button>
          <button type="button" onClick={run(onOpenKB)} className={`${item} text-slate-300 hover:bg-slate-950`}>
            <BookOpen className="w-4 h-4" aria-hidden="true" /> Knowledge Base
          </button>
          <button type="button" onClick={run(onOpenAI)} className={`${item} text-slate-300 hover:bg-slate-950`}>
            <Settings className="w-4 h-4" aria-hidden="true" /> AI Settings
          </button>

          <p className="px-3 pt-5 pb-1 text-xs font-mono text-slate-400">COMING SOON</p>
          {SOON.map(({ label, icon: Icon }) => (
            <div key={label} aria-disabled="true" className={`${item} text-slate-500 cursor-not-allowed`}>
              <Icon className="w-4 h-4" aria-hidden="true" /> {label}
              <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">Soon</span>
            </div>
          ))}
        </nav>
      </aside>

      <header className="sticky top-0 z-20 h-16 flex items-center gap-3 px-4 md:px-8 bg-slate-900 border-b border-slate-800">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="lg:hidden text-slate-300"><Menu className="w-5 h-5" /></button>
        <h1 className="text-lg font-semibold">{view === "overview" ? "SEO Overview" : "Article Studio"}</h1>
        <div className="ml-auto flex items-center gap-2">
          {usage && (
            <span className={`px-3 py-1.5 rounded-full text-xs font-mono border ${limitReached ? "border-red-900 text-red-300" : "border-slate-800 text-slate-400"}`} title={`Resets at ${new Date(usage.resets_at).toLocaleTimeString()}`}>
              {usage.used_today} / {usage.daily_limit} runs today
            </span>
          )}
          {tier && (
            <button type="button" onClick={onOpenPlans} aria-haspopup="dialog" className={`px-4 py-1.5 rounded-full text-xs font-mono border hover:border-cyan-400 ${tier === "pro" ? "bg-cyan-950 text-cyan-400 border-cyan-500/40" : "bg-slate-950 text-slate-400 border-slate-800"}`}>
              {tier === "pro" ? "PRO PLAN" : "FREE PLAN"}
            </button>
          )}
        </div>
      </header>

      <main id="main" className="p-4 md:p-8">{children}</main>
    </div>
  );
}
