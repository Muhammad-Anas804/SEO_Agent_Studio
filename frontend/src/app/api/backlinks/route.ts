import { attr, rateLimited, safeGetHtml } from "@/lib/netsafe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (rateLimited(req, 6)) return Response.json({ detail: "Too many requests, try again in a minute" }, { status: 429 });
  let body: { target?: unknown; urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Invalid request" }, { status: 400 });
  }
  const target = typeof body.target === "string"
    ? body.target.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    : "";
  const urls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === "string").map((u) => u.trim()).filter(Boolean).slice(0, 10)
    : [];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(target)) return Response.json({ detail: "Enter your domain, e.g. example.com" }, { status: 400 });
  if (!urls.length) return Response.json({ detail: "Add at least one page URL to check" }, { status: 400 });

  const results = await Promise.all(urls.map(async (url) => {
    try {
      const { html, finalUrl, status } = await safeGetHtml(url);
      const links: { href: string; anchor: string; rel: string; nofollow: boolean }[] = [];
      const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const href = attr(m[1], "href");
        if (!href) continue;
        let abs: URL;
        try {
          abs = new URL(href, finalUrl);
        } catch {
          continue;
        }
        const host = abs.hostname.toLowerCase().replace(/^www\./, "");
        if (host !== target && !host.endsWith("." + target)) continue;
        const rel = (attr(m[1], "rel") ?? "").toLowerCase();
        links.push({
          href: abs.toString(),
          anchor: m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "(image or empty anchor)",
          rel,
          nofollow: /\b(nofollow|ugc|sponsored)\b/.test(rel),
        });
      }
      return { url, status, found: links.length > 0, links: links.slice(0, 10), error: null as string | null };
    } catch (e) {
      return { url, status: 0, found: false, links: [], error: e instanceof Error ? e.message : "Could not fetch that page" };
    }
  }));
  return Response.json({ target, results });
}