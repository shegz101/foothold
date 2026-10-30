import { qloo } from "./qloo";

export type Entity = { id: string; name: string; type: string; hint?: string; image?: string };

const ENTITY_TYPES = ["artist", "movie", "tv_show", "book", "podcast", "videogame", "brand", "person"].map((t) => `urn:entity:${t}`);

export const BUSINESS_TAGS: Record<string, string> = {
  restaurant: "urn:tag:genre:place:restaurant",
  cafe: "urn:tag:category:place:cafe",
  grocery: "urn:tag:category:place:grocery_store",
  bookshop: "urn:tag:category:place:book_store",
  salon: "urn:tag:category:place:hair_salon",
};

/** Resolve free-text names to candidate Qloo entities for the user to confirm. */
export async function searchEntities(query: string): Promise<Entity[]> {
  const r = await qloo("/search", { query, types: ENTITY_TYPES.join(","), take: 5 });
  const seen = new Set<string>();
  return (r.results ?? []).filter((e: any) => !seen.has(e.entity_id) && seen.add(e.entity_id)).map((e: any) => ({
    id: e.entity_id,
    name: e.name,
    type: e.types?.[0] ?? e.subtype ?? e.type ?? "urn:entity:unknown",
    hint: [e.disambiguation, e.tags?.[0]?.name].filter(Boolean).join(" · ") || undefined,
    image: e.properties?.image?.url,
  }));
}

/** Candidate cities. An empty list means Qloo doesn't know the place (e.g. a typo). */
export async function searchCities(query: string) {
  const r = await qloo("/search", { query, types: "urn:entity:locality", take: 5 });
  const seen = new Set<string>();
  return (r.results ?? [])
    .filter((e: any) => !seen.has(e.entity_id) && seen.add(e.entity_id))
    .map((e: any) => ({ id: e.entity_id, name: e.name, label: e.disambiguation ?? e.name }));
}

/** Use the confirmed disambiguated label as the location query so it can't resolve elsewhere. */
function loc(label: string) {
  return { "filter.location.query": label };
}

export async function resolveTag(query: string, typePrefix: string) {
  const r = await qloo("/v2/tags", { "filter.query": query });
  const tags: any[] = r.results?.tags ?? [];
  return tags.find((t) => t.id.startsWith(typePrefix)) ?? null;
}

function km(la1: number, lo1: number, la2: number, lo2: number) {
  const r = Math.PI / 180, dx = (lo2 - lo1) * r * Math.cos(((la1 + la2) / 2) * r), dy = (la2 - la1) * r;
  return 6371 * Math.hypot(dx, dy);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function buildBrief(input: { business: string; cityLabel: string; anchors: Entity[] }) {
  const { business, cityLabel, anchors } = input;
  const signal = anchors.map((a) => a.id).join(",");
  const base = { "signal.interests.entities": signal };
  const placeTag = BUSINESS_TAGS[business];

  const [demo, heat, venues, namer, brands, artists, podcasts, vibe] = await Promise.all([
    qloo("/v2/insights", { "filter.type": "urn:demographics", ...base }),
    qloo("/v2/insights", { "filter.type": "urn:heatmap", ...loc(cityLabel), ...base }),
    qloo("/v2/insights", {
      "filter.type": "urn:entity:place",
      ...loc(cityLabel),
      ...(placeTag ? { "filter.tags": placeTag } : {}),
      ...base,
      "feature.explainability": true,
      take: 30,
    }),
    qloo("/v2/insights", { "filter.type": "urn:entity:place", ...loc(cityLabel), ...base, take: 50 }),
    qloo("/v2/insights", { "filter.type": "urn:entity:brand", ...base, take: 8 }),
    qloo("/v2/insights", { "filter.type": "urn:entity:artist", ...base, take: 8 }),
    qloo("/v2/insights", { "filter.type": "urn:entity:podcast", ...base, take: 6 }),
    qloo("/v2/insights", { "filter.type": "urn:tag", "filter.tag.types": "urn:tag:ambience:qloo", ...base }),
  ]);

  // Customer profile: mean of per-anchor signed affinities (as returned by Qloo).
  const rows: any[] = demo.results?.demographics ?? [];
  const keys = (g: "age" | "gender") => [...new Set(rows.flatMap((r) => Object.keys(r.query?.[g] ?? {})))];
  const profile = (g: "age" | "gender") =>
    keys(g)
      .map((k) => ({ label: k, affinity: avg(rows.map((r) => r.query?.[g]?.[k]).filter((v) => typeof v === "number")) as number }))
      .sort((a, b) => b.affinity - a.affinity);

  const anchorName = new Map(anchors.map((a) => [a.id.toLowerCase(), a.name]));

  const places: any[] = venues.results?.entities ?? [];
  const mapped = places.map((p) => ({
    id: p.entity_id as string,
    name: p.name as string,
    neighborhood: (p.properties?.geocode?.name ?? null) as string | null,
    city: (p.properties?.geocode?.city ?? null) as string | null,
    lat: p.location?.lat as number | undefined,
    lon: p.location?.lon as number | undefined,
    address: p.properties?.address ?? null,
    website: p.properties?.website ?? null,
    priceLevel: p.properties?.price_level ?? null, // often missing; shown only if present
    affinity: p.query?.affinity as number,
    drivers: ((p.query?.explainability?.["signal.interests.entities"] ?? []) as any[])
      .map((d) => ({ anchor: anchorName.get(String(d.entity_id).toLowerCase()) ?? "unknown", score: d.score as number }))
      .sort((a, b) => b.score - a.score),
  }));

  // Collapse chains (e.g. several Starbucks) into their best-matching location, keeping a count.
  const first = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ")[0];
  const tally = new Map<string, number>();
  for (const m of mapped) tally.set(first(m.name), (tally.get(first(m.name)) ?? 0) + 1);
  const seenChain = new Set<string>();
  const venuesDeduped = mapped
    .filter((m) => {
      const k = first(m.name);
      if (k.length < 4 || (tally.get(k) ?? 0) < 2) return true;
      if (seenChain.has(k)) return false;
      seenChain.add(k);
      return true;
    })
    .map((m) => ({ ...m, locations: tally.get(first(m.name)) ?? 1 }));

  // Neighborhoods: take the hottest heatmap cells, name each by the nearest Qloo place's neighborhood
  // (within 2.5km), then rank neighborhoods by their cells' mean affinity.
  const named = [...(namer.results?.entities ?? []), ...places]
    .filter((p: any) => p.location?.lat != null && p.properties?.geocode?.name)
    .map((p: any) => ({ lat: p.location.lat as number, lon: p.location.lon as number, name: p.properties.geocode.name as string }));
  const sorted: any[] = [...(heat.results?.heatmap ?? [])].sort(
    (a, b) => (b.query?.affinity_rank ?? 0) - (a.query?.affinity_rank ?? 0),
  );
  const areaOf = (c: any) => {
    let best: { name: string; d: number } | null = null;
    for (const n of named) {
      const d = km(c.location.latitude, c.location.longitude, n.lat, n.lon);
      if (d <= 2.5 && (!best || d < best.d)) best = { name: n.name, d };
    }
    return best?.name ?? null;
  };
  const mapCells = sorted.slice(0, 150).map((c, i) => ({
    lat: c.location.latitude as number,
    lon: c.location.longitude as number,
    rank: c.query.affinity_rank as number,
    area: areaOf(c),
    hot: i < 60,
  }));
  const hot = new Map<string, number[]>();
  for (const c of mapCells) if (c.hot && c.area) hot.set(c.area, [...(hot.get(c.area) ?? []), c.rank]);
  const neighborhoods = [...hot.entries()]
    .map(([name, ranks]) => ({
      name,
      hotCells: ranks.length,
      score: avg(ranks)!,
      venues: venuesDeduped.filter((m) => m.neighborhood === name),
    }))
    .sort((a, b) => b.score * Math.sqrt(b.hotCells) - a.score * Math.sqrt(a.hotCells))
    .slice(0, 6);

  // Existing audience-matched venues grouped by Qloo's neighborhood name (competitors / anchors).
  const byArea = new Map<string, typeof mapped>();
  for (const m of venuesDeduped) {
    const k = m.neighborhood ?? m.city ?? "Elsewhere in the metro";
    byArea.set(k, [...(byArea.get(k) ?? []), m]);
  }
  const venueAreas = [...byArea.entries()]
    .map(([name, venues]) => ({ name, score: avg(venues.map((v) => v.affinity))!, venues }))
    .sort((a, b) => b.score - a.score);

  const ent = (r: any) =>
    (r.results?.entities ?? []).filter((e: any) => e.name?.trim()).map((e: any) => ({
      id: e.entity_id, name: e.name, image: e.properties?.image?.url ?? null, affinity: e.query?.affinity ?? null,
    }));

  return {
    business,
    city: cityLabel,
    anchors,
    cells: mapCells,
    heatmapCells: (heat.results?.heatmap ?? []).length,
    demographics: { age: profile("age"), gender: profile("gender") },
    neighborhoods,
    venueAreas,
    partners: { brands: ent(brands), artists: ent(artists), podcasts: ent(podcasts) },
    vibe: (vibe.results?.tags ?? []).map((t: any) => ({ id: t.tag_id, name: t.name, affinity: t.query?.affinity ?? null })),
    gaps: [
      ...(neighborhoods.length ? [] : ["Qloo returned no venues for this business type in this city."]),
      ...(neighborhoods.length || !heat.results?.heatmap?.length ? [] : ["Heatmap cells could not be matched to named neighborhoods."]),
      ...(heat.results?.heatmap?.length ? [] : ["Qloo returned no heatmap for this city."]),
      ...(rows.length ? [] : ["Qloo returned no demographics for these anchors."]),
    ],
  };
}
