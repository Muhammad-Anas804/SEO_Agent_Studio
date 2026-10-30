import { makeCheck, readJsonBody, requireString, scoreChecks, withGuards } from "@/lib/tools/api";
import { getHtml, getText } from "@/lib/tools/fetcher";
import { collectMatches, getAttr, getMeta, stripTags, findTags, toPlainText } from "@/lib/tools/html";
import type { BotStatus, ReadinessResult } from "@/types/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Crawlers used by AI answer engines. */
const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"];
const MIN_TEXT_CHARS = 500;

// ---------------------------------------------------------------- robots.txt
interface RobotsGroup {
  agents: string[];
  rules: { type: "allow" | "disallow"; path: string }[];
}

/** Parses robots.txt into groups of (user-agents, rules). */
function parseRobots(robots: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let previousWasAgent = false;

  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    const colon = line.indexOf(":");
    if (!line || colon < 0) continue;

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines share one rule set.
      if (!current || !previousWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      previousWasAgent = true;
    } else {
      previousWasAgent = false;
      if (current && (field === "allow" || field === "disallow")) current.rules.push({ type: field, path: value });
    }
  }
  return groups;
}

/** A bot is blocked when its group (or the "*" group) disallows "/" without re-allowing it. */
function isBlocked(groups: RobotsGroup[], bot: string): boolean {
  const group =
    groups.find((g) => g.agents.includes(bot.toLowerCase())) ?? groups.find((g) => g.agents.includes("*"));
  if (!group) return false;
  const blocksAll = group.rules.some((r) => r.type === "disallow" && r.path === "/");
  const allowsAll = group.rules.some((r) => r.type === "allow" && r.path === "/");
  return blocksAll && !allowsAll;
}

// ---------------------------------------------------------------- helpers
/** Body of a text file if it exists and is not an HTML "soft 404" page, else null. */
async function fetchTextFile(url: string): Promise<string | null> {
  try {
    const res = await getText(url);
    return res.status === 200 && !/html/i.test(res.contentType) ? res.body : null;
  } catch {
    return null;
  }
}

function extractJsonLd(html: string): { text: string; types: string[] } {
  const blocks = collectMatches(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, (m) => m[1]);
  const text = blocks.join("\n");
  const types = collectMatches(text, /"@type"\s*:\s*"([^"]+)"/g, (m) => m[1]);
  return { text, types: Array.from(new Set(types)) };
}

function extractHeadings(html: string): string[] {
  return collectMatches(html, /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi, (m) => stripTags(m[1]));
}

const QUESTION_HEADING = /\?\s*$|^(how|what|why|when|where|who|which|can|is|are|does|do|should)\b/i;

// ---------------------------------------------------------------- route
export const POST = withGuards({ name: "geo", limit: 10 }, async (req): Promise<ReadinessResult> => {
  const body = await readJsonBody(req);
  const page = await getHtml(requireString(body, "url", "Enter a URL"));
  const html = page.body;
  const origin = new URL(page.finalUrl).origin;

  const [robotsTxt, llmsTxt, sitemapXml] = await Promise.all([
    fetchTextFile(`${origin}/robots.txt`),
    fetchTextFile(`${origin}/llms.txt`),
    fetchTextFile(`${origin}/sitemap.xml`),
  ]);

  // Crawler access
  const groups = parseRobots(robotsTxt ?? "");
  const bots: BotStatus[] = AI_BOTS.map((bot) => ({ bot, blocked: isBlocked(groups, bot) }));
  const blockedBots = bots.filter((b) => b.blocked).map((b) => b.bot);

  // Page content signals
  const { text: jsonLd, types: schemaTypes } = extractJsonLd(html);
  const headings = extractHeadings(html);
  const questionHeadings = headings.filter((h) => QUESTION_HEADING.test(h));
  const visibleTextLength = toPlainText(html).length;
  const hasFaqSchema = /FAQPage|QAPage/.test(jsonLd);
  const hasAuthor = getMeta(html, "name", "author") !== null || /"author"\s*:/.test(jsonLd);
  const hasDate =
    getMeta(html, "property", "article:published_time") !== null ||
    /"(datePublished|dateModified)"/.test(jsonLd) ||
    findTags(html, "time").some((t) => getAttr(t, "datetime") !== null);

  // Site-level files
  const hasSitemap = /^sitemap:/im.test(robotsTxt ?? "") || /<urlset|<sitemapindex/i.test(sitemapXml ?? "");
  const hasLlmsTxt = (llmsTxt ?? "").trim().length > 20;

  const checks = [
    makeCheck("AI crawlers are not blocked in robots.txt", blockedBots.length === 0,
      blockedBots.length
        ? `Blocked: ${blockedBots.join(", ")}. These tools cannot read or cite your site.`
        : robotsTxt ? "GPTBot, ClaudeBot, PerplexityBot, Google-Extended and CCBot are all allowed"
                    : "No robots.txt found, so nothing is blocked"),
    makeCheck("Content is readable without JavaScript", visibleTextLength >= MIN_TEXT_CHARS,
      `${visibleTextLength} characters of text in the raw HTML. Crawlers that skip JavaScript see only this.`),
    makeCheck("Structured data (JSON-LD) present", schemaTypes.length > 0,
      schemaTypes.length ? `Types found: ${schemaTypes.slice(0, 6).join(", ")}` : "No JSON-LD found"),
    makeCheck("FAQ or Q&A content present", hasFaqSchema || questionHeadings.length >= 2,
      `${questionHeadings.length} question-style headings${hasFaqSchema ? " and FAQ schema" : ""}`),
    makeCheck("Clear heading structure (2+ H2/H3)", headings.length >= 2, `${headings.length} H2/H3 headings found`),
    makeCheck("Author named", hasAuthor,
      hasAuthor ? "Found" : "No author in meta tags or JSON-LD (weakens trust signals)"),
    makeCheck("Publish or update date present", hasDate,
      hasDate ? "Found" : "No date found (freshness is unclear to engines)"),
    makeCheck("Sitemap available", hasSitemap, hasSitemap ? "Found" : "No sitemap in robots.txt or at /sitemap.xml"),
    makeCheck("llms.txt file present", hasLlmsTxt,
      hasLlmsTxt ? "Found" : "Not found. This is an emerging proposal and no major engine has confirmed it affects citations, so treat it as optional.",
      true),
  ];

  return { finalUrl: page.finalUrl, score: scoreChecks(checks), checks, bots };
});