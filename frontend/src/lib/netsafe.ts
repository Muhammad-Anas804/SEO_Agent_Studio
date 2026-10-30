import { lookup } from "node:dns/promises";
import net from "node:net";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return v.includes(".") ? isPrivateIp(v.slice(7)) : true;
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") ||
    v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

async function assertPublic(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http and https URLs are allowed");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("Only standard web ports are allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That address is not allowed");
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("That address is not allowed");
}

async function readLimited(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const dec = new TextDecoder();
  let out = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    out += dec.decode(value, { stream: true });
    if (size > max) {
      await reader.cancel();
      break;
    }
  }
  return out;
}

export function normalizeUrl(input: string): URL {
  const raw = input.trim();
  if (!raw || raw.length > 2048) throw new Error("Enter a valid URL");
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("Enter a valid URL");
  }
}

export async function safeGetHtml(input: string, maxRedirects = 3) {
  let u = normalizeUrl(input);
  const started = Date.now();
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublic(u);
    const res = await fetch(u, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "SEOAgentStudioBot/1.0", Accept: "text/html,application/xhtml+xml" },
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      u = new URL(loc, u);
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(type)) throw new Error("That URL did not return a web page");
    const html = await readLimited(res, 1_500_000);
    return { html, finalUrl: u.toString(), status: res.status, ms: Date.now() - started };
  }
  throw new Error("Too many redirects");
}

export const tags = (html: string, name: string): string[] =>
  html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];

export function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

const hits = new Map<string, number[]>();
export function rateLimited(req: Request, limit = 20, windowMs = 60_000): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limit;
}