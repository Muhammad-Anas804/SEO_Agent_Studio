import { makeCheck, readJsonBody, requireString, scoreChecks, withGuards } from "@/lib/tools/api";
import { getHtml } from "@/lib/tools/fetcher";
import { findTags, getAttr, getMeta, getTitle } from "@/lib/tools/html";
import type { AuditResult, Check } from "@/types/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TITLE_LENGTH = { min: 30, max: 60 };
const DESCRIPTION_LENGTH = { min: 70, max: 160 };

const inRange = (n: number, r: { min: number; max: number }) => n >= r.min && n <= r.max;
const foundOrMissing = (found: boolean) => (found ? "Found" : "Missing");

/** On-page checks for a single HTML document. */
function runChecks(html: string, finalUrl: string): Check[] {
  const title = getTitle(html);
  const description = (getMeta(html, "name", "description") ?? "").trim();
  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  const images = findTags(html, "img");
  const imagesWithoutAlt = images.filter((tag) => getAttr(tag, "alt") === null).length;
  const hasCanonical = findTags(html, "link").some((t) => (getAttr(t, "rel") ?? "").toLowerCase() === "canonical");
  const hasViewport = getMeta(html, "name", "viewport") !== null;
  const hasLang = /<html[^>]*\blang\s*=/i.test(html);
  const hasOgTitle = getMeta(html, "property", "og:title") !== null;
  const isNoindex = (getMeta(html, "name", "robots") ?? "").toLowerCase().includes("noindex");
  const isHttps = finalUrl.startsWith("https://");

  return [
    makeCheck("Uses HTTPS", isHttps, isHttps ? "Secure connection" : "Page is served over plain HTTP"),
    makeCheck("Title tag is 30-60 characters", inRange(title.length, TITLE_LENGTH),
      title ? `${title.length} characters: "${title}"` : "No title found"),
    makeCheck("Meta description is 70-160 characters", inRange(description.length, DESCRIPTION_LENGTH),
      description ? `${description.length} characters` : "No meta description found"),
    makeCheck("Exactly one H1", h1Count === 1, `${h1Count} H1 tag(s) found`),
    makeCheck("All images have alt text", imagesWithoutAlt === 0,
      images.length ? `${imagesWithoutAlt} of ${images.length} images missing alt` : "No images found"),
    makeCheck("Canonical tag present", hasCanonical, foundOrMissing(hasCanonical)),
    makeCheck("Viewport meta tag (mobile friendly)", hasViewport, foundOrMissing(hasViewport)),
    makeCheck("Language set on <html>", hasLang, foundOrMissing(hasLang)),
    makeCheck("Open Graph title present", hasOgTitle, hasOgTitle ? "Found" : "Missing (affects social sharing previews)"),
    makeCheck("Not blocked from indexing", !isNoindex, isNoindex ? "Robots meta contains noindex" : "No noindex found"),
  ];
}

export const POST = withGuards({ name: "audit" }, async (req): Promise<AuditResult> => {
  const body = await readJsonBody(req);
  const page = await getHtml(requireString(body, "url", "Enter a URL"));
  const checks = runChecks(page.body, page.finalUrl);
  return { finalUrl: page.finalUrl, status: page.status, ms: page.ms, score: scoreChecks(checks), checks };
});