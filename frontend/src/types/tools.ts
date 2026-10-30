/**
 * Response shapes for the SEO tool API routes.
 * Routes return these; components consume them. Keep both sides in sync here.
 */

/** One pass/fail finding shown in a result list. */
export interface Check {
  name: string;
  pass: boolean;
  detail: string;
  /** True for practices that are not yet proven to matter. Shown with a badge. */
  emerging?: boolean;
}

// ---- Website Audits -------------------------------------------------------
export interface AuditResult {
  finalUrl: string;
  status: number;
  ms: number;
  score: number;
  checks: Check[];
}

// ---- Keyword Research -----------------------------------------------------
export interface KeywordGroups {
  questions: string[];
  comparisons: string[];
  commercial: string[];
  other: string[];
}

export interface KeywordResult {
  query: string;
  total: number;
  groups: KeywordGroups;
}

// ---- Backlink Analysis ----------------------------------------------------
export interface BacklinkInfo {
  href: string;
  anchor: string;
  rel: string;
  /** True when rel contains nofollow, ugc or sponsored. */
  nofollow: boolean;
}

export interface BacklinkPageResult {
  url: string;
  status: number;
  found: boolean;
  links: BacklinkInfo[];
  error: string | null;
}

export interface BacklinkResult {
  target: string;
  results: BacklinkPageResult[];
}

// ---- AI Search Readiness --------------------------------------------------
export interface BotStatus {
  bot: string;
  blocked: boolean;
}

export interface ReadinessResult {
  finalUrl: string;
  score: number;
  checks: Check[];
  bots: BotStatus[];
}