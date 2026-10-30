import { attr, rateLimited, safeGetHtml, tags } from "@/lib/netsafe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function meta(html: string, key: "name" | "property", value: string): string | null {
  for (const t of tags(html, "meta")) {
    if ((attr(t, key) ?? "").toLowerCase() === value) return attr(t, "content") ?? "";
  }
  return null;
}

export async function POST(req: Request) {
  if (rateLimited(req)) return Response.json({ detail: "Too many requests, try again in a minute" }, { status: 429 });
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Invalid request" }, { status: 400 });
  }
  if (typeof body.url !== "string") return Response.json({ detail: "Enter a URL" }, { status: 400 });

  try {
    const { html, finalUrl, status, ms } = await safeGetHtml(body.url);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
    const desc = (meta(html, "name", "description") ?? "").trim();
    const h1 = (html.match(/<h1\b/gi) ?? []).length;
    const imgs = tags(html, "img");
    const noAlt = imgs.filter((t) => attr(t, "alt") === null).length;
    const canonical = tags(html, "link").some((t) => (attr(t, "rel") ?? "").toLowerCase() === "canonical");
    const robots = (meta(html, "name", "robots") ?? "").toLowerCase();

    const checks = [
      { name: "Uses HTTPS", pass: finalUrl.startsWith("https://"), detail: finalUrl.startsWith("https://") ? "Secure connection" : "Page is served over plain HTTP" },
      { name: "Title tag is 30-60 characters", pass: title.length >= 30 && title.length <= 60, detail: title ? `${title.length} characters: "${title}"` : "No title found" },
      { name: "Meta description is 70-160 characters", pass: desc.length >= 70 && desc.length <= 160, detail: desc ? `${desc.length} characters` : "No meta description found" },
      { name: "Exactly one H1", pass: h1 === 1, detail: `${h1} H1 tag(s) found` },
      { name: "All images have alt text", pass: noAlt === 0, detail: imgs.length ? `${noAlt} of ${imgs.length} images missing alt` : "No images found" },
      { name: "Canonical tag present", pass: canonical, detail: canonical ? "Found" : "Missing" },
      { name: "Viewport meta tag (mobile friendly)", pass: meta(html, "name", "viewport") !== null, detail: meta(html, "name", "viewport") !== null ? "Found" : "Missing" },
      { name: "Language set on <html>", pass: /<html[^>]*\blang\s*=/i.test(html), detail: /<html[^>]*\blang\s*=/i.test(html) ? "Found" : "Missing" },
      { name: "Open Graph title present", pass: meta(html, "property", "og:title") !== null, detail: meta(html, "property", "og:title") !== null ? "Found" : "Missing (affects social sharing previews)" },
      { name: "Not blocked from indexing", pass: !robots.includes("noindex"), detail: robots.includes("noindex") ? "Robots meta contains noindex" : "No noindex found" },
    ];
    const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
    return Response.json({ finalUrl, status, ms, score, checks });
  } catch (e) {
    return Response.json({ detail: e instanceof Error ? e.message : "Could not audit that URL" }, { status: 400 });
  }
}