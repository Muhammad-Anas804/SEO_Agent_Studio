/**
 * Safe HTTP client for the SEO tools.
 * Every redirect hop is re-validated, and time and size are capped.
 */
import { ToolError } from "./errors";
import { assertPublicUrl, normalizeUrl } from "./ssrf";

const USER_AGENT = "SEOAgentStudioBot/1.0";
const MAX_REDIRECTS = 3;

export interface FetchedPage {
  body: string;
  finalUrl: string;
  status: number;
  contentType: string;
  ms: number;
}

interface FetchOptions {
  accept: string;
  timeoutMs: number;
  maxBytes: number;
  /** If set, the response Content-Type must match or a ToolError is thrown. */
  requireType?: RegExp;
}

/** Reads at most `maxBytes` of the body so a huge file cannot exhaust memory. */
async function readBody(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    text += decoder.decode(value, { stream: true });
    if (size > maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return text;
}

async function fetchPublic(input: string, options: FetchOptions): Promise<FetchedPage> {
  let url = normalizeUrl(input);
  const startedAt = Date.now();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url); // re-checked on EVERY hop, redirects can point inward

    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: { "User-Agent": USER_AGENT, Accept: options.accept },
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new ToolError(timedOut ? "The site took too long to respond" : "Could not reach that site");
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      void res.body?.cancel();
      url = new URL(location, url);
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (options.requireType && !options.requireType.test(contentType)) {
      void res.body?.cancel();
      throw new ToolError("That URL did not return a web page");
    }

    return {
      body: await readBody(res, options.maxBytes),
      finalUrl: url.toString(),
      status: res.status,
      contentType,
      ms: Date.now() - startedAt,
    };
  }
  throw new ToolError("Too many redirects");
}

/** Fetches an HTML page (max 1.5 MB, 8 s). */
export function getHtml(url: string): Promise<FetchedPage> {
  return fetchPublic(url, {
    accept: "text/html,application/xhtml+xml",
    timeoutMs: 8000,
    maxBytes: 1_500_000,
    requireType: /html|xml/i,
  });
}

/** Fetches a small text file such as robots.txt (max 300 KB, 6 s). */
export function getText(url: string): Promise<FetchedPage> {
  return fetchPublic(url, { accept: "text/plain,*/*", timeoutMs: 6000, maxBytes: 300_000 });
}