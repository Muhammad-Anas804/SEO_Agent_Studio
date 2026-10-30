/**
 * Simple sliding-window rate limiter, per tool and per client IP.
 *
 * In memory only: it resets on restart and is not shared between server
 * instances. For production, replace it with Redis or the FastAPI backend.
 */
const WINDOW_MS = 60_000;
const PRUNE_ABOVE = 5000;
const hits = new Map<string, number[]>();

export function isRateLimited(req: Request, bucket: string, limit: number): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();

  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > PRUNE_ABOVE) {
    hits.forEach((times, k) => {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    });
  }
  return recent.length > limit;
}