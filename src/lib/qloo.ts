import "server-only";

const BASE = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";
const TTL_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS = 250; // ~4 req/s, under Qloo's ~5/s limit
const MONTHLY_BUDGET = Number(process.env.QLOO_MONTHLY_BUDGET || 8000); // Qloo allows 10,000

export class QlooError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | undefined>;

// In-memory state. On serverless this is per warm instance, so it is a best-effort guard.
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
let spent = { month: monthKey(), calls: 0 };
let nextSlot = 0;

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

export function budgetStatus() {
  if (spent.month !== monthKey()) spent = { month: monthKey(), calls: 0 };
  return { used: spent.calls, limit: MONTHLY_BUDGET };
}

async function throttle() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

async function fetchQloo(path: string, params: Params): Promise<unknown> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new QlooError("QLOO_API_KEY is not configured", 500);
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

  for (let attempt = 0; attempt < 5; attempt++) {
    if (budgetStatus().used >= MONTHLY_BUDGET) throw new QlooError("Monthly Qloo call budget reached", 503);
    await throttle();
    spent.calls++;
    const res = await fetch(url, { headers: { "X-Api-Key": key }, cache: "no-store" });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new QlooError(`Qloo ${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
    return res.json();
  }
  throw new QlooError("Qloo is rate limiting us; try again shortly", 429); // never treated as "no results"
}

export async function qloo<T = any>(path: string, params: Params): Promise<T> {
  const k = path + "?" + JSON.stringify(Object.entries(params).sort());
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  let p = inflight.get(k);
  if (!p) {
    p = fetchQloo(path, params)
      .then((data) => {
        cache.set(k, { at: Date.now(), data });
        return data;
      })
      .finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p as Promise<T>;
}
