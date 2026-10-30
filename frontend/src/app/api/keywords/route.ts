import { withGuards } from "@/lib/tools/api";
import { ToolError } from "@/lib/tools/errors";
import type { KeywordGroups, KeywordResult } from "@/types/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Uses Google's public autocomplete endpoint. It is unofficial and can change
 * or throttle at any time. For production, switch to a paid keyword API.
 */
const SUGGEST_URL = "https://suggestqueries.google.com/complete/search";

const QUESTION = /^(how|what|why|when|where|who|which|can|is|are|does|do|should|will)\b/i;
const COMPARISON = /\b(vs|versus|alternative|alternatives|compared|comparison)\b/i;
const COMMERCIAL = /\b(best|top|review|reviews|price|pricing|cost|buy|cheap|free|discount|deal|near me)\b/i;

/** Variations of the seed keyword that surface different kinds of suggestions. */
const buildSeeds = (q: string): string[] => [
  q, `best ${q}`, `how to ${q}`, `what is ${q}`, `why ${q}`,
  `${q} for`, `${q} vs`, `${q} with`, `${q} without`,
  `${q} free`, `${q} cost`, `${q} examples`, `${q} tools`,
];

function classify(keyword: string): keyof KeywordGroups {
  if (QUESTION.test(keyword)) return "questions";
  if (COMPARISON.test(keyword)) return "comparisons";
  if (COMMERCIAL.test(keyword)) return "commercial";
  return "other";
}

async function fetchSuggestions(query: string): Promise<string[]> {
  try {
    const res = await fetch(`${SUGGEST_URL}?client=firefox&q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const list = Array.isArray(data) ? data[1] : null;
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return []; // one failed seed should not fail the whole search
  }
}

export const GET = withGuards({ name: "keywords" }, async (req): Promise<KeywordResult> => {
  const query = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 80) throw new ToolError("Enter a keyword of 2 to 80 characters");

  const lists = await Promise.all(buildSeeds(query).map(fetchSuggestions));

  const groups: KeywordGroups = { questions: [], comparisons: [], commercial: [], other: [] };
  const seen = new Set<string>([query.toLowerCase()]); // de-duplicate across seeds
  for (const list of lists) {
    for (const suggestion of list) {
      const keyword = suggestion.trim().toLowerCase();
      if (!keyword || seen.has(keyword)) continue;
      seen.add(keyword);
      groups[classify(keyword)].push(keyword);
    }
  }

  const total = seen.size - 1; // minus the seed itself
  if (total === 0) throw new ToolError("No suggestions found, or the suggestion service is unavailable right now", 502);
  return { query, total, groups };
});