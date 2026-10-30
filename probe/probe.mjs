// Foothold step 1: probe the Qloo hackathon API and report what works.
// Usage: node --env-file=.env.local probe/probe.mjs [City] [OtherCity...]
// Outputs are saved to probe/out/ (gitignored). Never commit them.
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";
const KEY = process.env.QLOO_API_KEY;
if (!KEY) {
  console.error("Missing QLOO_API_KEY (put it in .env.local; run with --env-file=.env.local)");
  process.exit(1);
}
const cities = process.argv.slice(2);
if (!cities.length) cities.push("Chicago");

const OUT = new URL("./out/", import.meta.url);
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = [];

async function call(name, path, params) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(300); // stay under ~5 req/s
    const res = await fetch(url, { headers: { "X-Api-Key": KEY } });
    if (res.status === 429) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    await writeFile(new URL(`${name}.json`, OUT), JSON.stringify({ status: res.status, params, body }, null, 2));
    return { status: res.status, body };
  }
  return { status: 429, body: null };
}

function report(name, r, note = "") {
  const ok = r.status === 200;
  summary.push({ name, status: r.status, note });
  console.log(`${ok ? "OK  " : "FAIL"} ${name} [${r.status}] ${note}`);
  if (!ok) console.log("     ", JSON.stringify(r.body)?.slice(0, 300));
}

const results = (b) => b?.results?.entities ?? b?.results ?? [];

// 1. /search: resolve anchors
const anchors = [];
for (const [q, type] of [
  ["Burna Boy", "urn:entity:artist"],
  ["Wizkid", "urn:entity:artist"],
  ["Living in Bondage", "urn:entity:movie"],
]) {
  const r = await call(`search_${q.replace(/\W+/g, "_")}`, "/search", { query: q, types: type });
  const list = results(r.body);
  const top = list[0];
  report(`search "${q}"`, r, top ? `-> ${top.name} (${top.entity_id})` : "no results");
  if (top?.entity_id) anchors.push(top.entity_id);
}
if (!anchors.length) {
  console.error("No anchors resolved; cannot continue.");
  process.exit(1);
}
const signal = anchors.join(",");

// 2. /v2/tags
let r = await call("tags_restaurant", "/v2/tags", { "filter.query": "restaurant" });
report("tags restaurant", r, `${(r.body?.results?.tags ?? []).length} tags`);
r = await call("tags_ambience", "/v2/insights", {
  "filter.type": "urn:tag",
  "filter.tag.types": "urn:tag:ambience:qloo",
  "signal.interests.entities": signal,
});
report("ambience tags", r, `${(r.body?.results?.tags ?? []).length} tags`);

// 3. demographics (not city-specific)
r = await call("demographics", "/v2/insights", {
  "filter.type": "urn:demographics",
  "signal.interests.entities": signal,
});
report("demographics", r, JSON.stringify(r.body?.results ?? {}).slice(0, 120));

// 4-5. per-city: heatmap + places
for (const city of cities) {
  const tag = city.replace(/\W+/g, "_");
  r = await call(`heatmap_${tag}`, "/v2/insights", {
    "filter.type": "urn:heatmap",
    "filter.location.query": city,
    "signal.interests.entities": signal,
  });
  const hm = r.body?.results?.heatmap ?? r.body?.results ?? [];
  report(`heatmap ${city}`, r, `${Array.isArray(hm) ? hm.length : "?"} cells`);

  r = await call(`places_${tag}`, "/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location.query": city,
    "signal.interests.entities": signal,
    "feature.explainability": "true",
    take: "10",
  });
  const places = results(r.body);
  const first = places[0];
  report(
    `places ${city}`,
    r,
    first ? `${places.length} places, e.g. ${first.name}; locality=${first.location?.city ?? first.properties?.address ?? "?"}` : "none",
  );
  // spot-check the "city silently resolves elsewhere" gotcha
  console.log("      resolved localities:", [...new Set(places.map((p) => p.location?.city ?? p.properties?.address ?? "?"))].slice(0, 5));
}

// 6. partners/channels
for (const [name, type] of [
  ["brands", "urn:entity:brand"],
  ["artists", "urn:entity:artist"],
  ["podcasts", "urn:entity:podcast"],
]) {
  r = await call(name, "/v2/insights", {
    "filter.type": type,
    "signal.interests.entities": signal,
    take: "10",
  });
  report(name, r, `${results(r.body).length} results`);
}

await writeFile(new URL("summary.json", OUT), JSON.stringify(summary, null, 2));
console.log("\nSaved raw outputs to probe/out/ (gitignored).");
