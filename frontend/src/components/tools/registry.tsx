/**
 * The ONE place that lists the SEO tools.
 * The sidebar, the header title and the page body all read from here.
 *
 * To add a tool: create its component, then add one line to TOOLS.
 */
import React from "react";
import { Globe, Link2, Search, Sparkles } from "lucide-react";
import AiReadiness from "@/components/AiReadiness";
import BacklinkAnalysis from "@/components/BacklinkAnalysis";
import KeywordResearch from "@/components/KeywordResearch";
import WebsiteAudit from "@/components/WebsiteAudit";

export const TOOLS = [
  { id: "audits", label: "Website Audits", icon: Globe, Component: WebsiteAudit },
  { id: "keywords", label: "Keyword Research", icon: Search, Component: KeywordResearch },
  { id: "backlinks", label: "Backlink Analysis", icon: Link2, Component: BacklinkAnalysis },
  { id: "geo", label: "AI Search Readiness", icon: Sparkles, Component: AiReadiness },
] as const;

export type ToolId = (typeof TOOLS)[number]["id"];

/** Every screen the app can show. */
export type View = "overview" | "studio" | ToolId;

export function viewTitle(view: View): string {
  if (view === "overview") return "SEO Overview";
  if (view === "studio") return "Article Studio";
  return TOOLS.find((tool) => tool.id === view)?.label ?? "";
}

/** Renders the active tool, or nothing when the view is not a tool. */
export function ToolView({ view }: { view: View }) {
  const tool = TOOLS.find((t) => t.id === view);
  if (!tool) return null;
  const { Component } = tool;
  return <Component />;
}