import { readJsonBody, withGuards } from "@/lib/tools/api";
import { ToolError } from "@/lib/tools/errors";
import { getHtml } from "@/lib/tools/fetcher";
import { collectMatches, getAttr, stripTags } from "@/lib/tools/html";
import type { BacklinkInfo, BacklinkPageResult, BacklinkResult } from "@/types/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PAGES = 10;
const MAX_LINKS_PER_PAGE = 10;
const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/** "https://www.Example.com/path" -> "example.com" */
const normalizeDomain = (input: string): string =>
  input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

function parseUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, MAX_PAGES);
}

function pointsToDomain(url: URL, domain: string): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === domain || host.endsWith(`.${domain}`);
}

/** Every <a> on the page whose destination is the target domain. */
function extractLinks(html: string, pageUrl: string, domain: string): BacklinkInfo[] {
  const anchors = collectMatches(html, /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (m) => ({ attrs: m[1], inner: m[2] }));
  const links: BacklinkInfo[] = [];

  for (const { attrs, inner } of anchors) {
    const href = getAttr(attrs, "href");
    if (!href) continue;

    let destination: URL;
    try {
      destination = new URL(href, pageUrl); // resolves relative links
    } catch {
      continue;
    }
    if (!pointsToDomain(destination, domain)) continue;

    const rel = (getAttr(attrs, "rel") ?? "").toLowerCase();
    links.push({
      href: destination.toString(),
      anchor: stripTags(inner).slice(0, 120) || "(image or empty anchor)",
      rel,
      nofollow: /\b(nofollow|ugc|sponsored)\b/.test(rel),
    });
  }
  return links;
}

async function checkPage(url: string, domain: string): Promise<BacklinkPageResult> {
  try {
    const page = await getHtml(url);
    const links = extractLinks(page.body, page.finalUrl, domain);
    return { url, status: page.status, found: links.length > 0, links: links.slice(0, MAX_LINKS_PER_PAGE), error: null };
  } catch (err) {
    // One bad page must not fail the whole batch.
    const message = err instanceof ToolError ? err.message : "Could not fetch that page";
    return { url, status: 0, found: false, links: [], error: message };
  }
}

export const POST = withGuards({ name: "backlinks", limit: 6 }, async (req): Promise<BacklinkResult> => {
  const body = await readJsonBody(req);
  const target = typeof body.target === "string" ? normalizeDomain(body.target) : "";
  const urls = parseUrls(body.urls);

  if (!DOMAIN_PATTERN.test(target)) throw new ToolError("Enter your domain, e.g. example.com");
  if (urls.length === 0) throw new ToolError("Add at least one page URL to check");

  return { target, results: await Promise.all(urls.map((url) => checkPage(url, target))) };
});