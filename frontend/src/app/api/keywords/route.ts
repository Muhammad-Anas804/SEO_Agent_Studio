import { rateLimited } from "@/lib/netsafe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QUESTION = /^(how|what|why|when|where|who|which|can|is|are|does|do|should|will)\b/i;
const COMPARE = /\b(vs|versus|alternative|alternatives|compared|comparison)\b/i;
const COMMERCIAL = /\b(best|top|review|reviews|price|pricing|cost|buy|cheap|free|discount|deal|near me)\b/i;

async function suggest(q: string): Promise<string[]> {
  try {
    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.[1]) ? data[1].filter((s: unknown): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  if (rateLimited(req)) return Response.json({ detail: "Too many requests, try again in a minute" }, { status: 429 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 80) return Response.json({ detail: "Enter a keyword of 2 to 80 characters" }, { status: 400 });

  const seeds = [q, `best ${q}`, `how to ${q}`, `what is ${q}`, `why ${q}`, `${q} for`, `${q} vs`, `${q} with`, `${q} without`, `${q} free`, `${q} cost`, `${q} examples`, `${q} tools`];
  const lists = await Promise.all(seeds.map(suggest));
  const seen = new Set<string>([q.toLowerCase()]);
  const groups = { questions: [] as string[], comparisons: [] as string[], commercial: [] as string[], other: [] as string[] };
  for (const list of lists) {
    for (const s of list) {
      const k = s.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      if (QUESTION.test(k)) groups.questions.push(k);
      else if (COMPARE.test(k)) groups.comparisons.push(k);
      else if (COMMERCIAL.test(k)) groups.commercial.push(k);
      else groups.other.push(k);
    }
  }
  const total = seen.size - 1;
  if (total === 0) return Response.json({ detail: "No suggestions found, or the suggestion service is unavailable right now" }, { status: 502 });
  return Response.json({ query: q, total, groups });
}