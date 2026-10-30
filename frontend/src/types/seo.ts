export interface AgentAuditLog {
  agent_name: string;
  execution_time_ms: number;
  status: string;
  details?: string | null;
  timestamp: string;
}

export interface InternalLinkSuggestion {
  anchor_text: string;
  target_path: string;
  context_sentence: string;
}

export interface JSONLDSchema {
  json_ld_article: string;
  json_ld_faq?: string | null;
}

export interface SERPResult {
  position: number;
  title: string;
  url: string;
  snippet: string;
}

export interface SERPQuestion {
  question: string;
  answer: string;
}

export interface SERPData {
  results: SERPResult[];
  people_also_ask: SERPQuestion[];
  related_searches: string[];
  cached: boolean;
}

export interface AIUsage {
  step: string;
  provider: string;
  model: string;
  attempts: number;
  fallback_used: boolean;
}

export interface SEOCheck {
  name: string;
  passed: boolean;
  detail: string;
  weight: number;
}

export interface SEOReport {
  score: number;
  checks: SEOCheck[];
}

export interface SEOState {
  run_id: string;
  created_at: string;
  target_keyword: string;
  target_url?: string | null;
  is_pro_tier: boolean;
  site_paths: string[];
  tone: string;
  word_count_target: number;
  language: string;
  search_intent?: string | null;
  lsi_keywords: string[];
  target_audience?: string | null;
  content_outline: string[];
  content_gap_insights: string[];
  meta_title?: string | null;
  meta_description?: string | null;
  generated_article_markdown?: string | null;
  estimated_read_time_minutes: number;
  schema_markup?: JSONLDSchema | null;
  internal_links: InternalLinkSuggestion[];
  seo_report?: SEOReport | null;
  serp?: SERPData | null;
  ai_usage: AIUsage[];
  ready_for_cms_publish: boolean;
  audit_trail: AgentAuditLog[];
  errors: string[];
  warnings: string[];
}

export type RunStatus = "queued" | "running" | "completed" | "partial" | "failed";

export interface RunRecord {
  run_id: string;
  status: RunStatus;
  keyword: string;
  tier: "free" | "pro";
  created_at: string;
  updated_at: string;
  data: SEOState | null;
}

export type RunSummary = Omit<RunRecord, "data"> & { score?: number | null };

export interface UsageInfo {
  tier: "free" | "pro";
  used_today: number;
  daily_limit: number;
  resets_at: string;
}

export interface ModelRef {
  provider: string;
  model: string;
}

export interface AIConfig {
  primary: ModelRef;
  fallbacks: ModelRef[];
  fallback_enabled: boolean;
}

export interface ProviderInfo {
  name: string;
  label: string;
  configured: boolean;
  models: string[];
}

export interface AISettingsView {
  config: AIConfig;
  source: "database" | "environment";
  can_edit: boolean;
  providers: ProviderInfo[];
}

export interface ConnectionTest {
  ok: boolean;
  latency_ms?: number;
  kind?: string;
  message?: string;
}

export interface KBPage {
  path: string;
  title: string;
  chunks: number;
}

export interface KBListing {
  pages: KBPage[];
  limit: number;
}
