// Simple per-visitor fixed-window limiter (in-memory, best effort on serverless).
const hits = new Map<string, { start: number; n: number }>();

export function allow(visitor: string, max = 20, windowMs = 60 * 60 * 1000) {
  if (process.env.NODE_ENV !== "production") return true; // no limits while developing
  const now = Date.now();
  const h = hits.get(visitor);
  if (!h || now - h.start > windowMs) {
    hits.set(visitor, { start: now, n: 1 });
    return true;
  }
  return ++h.n <= max;
}

export function visitorId(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
