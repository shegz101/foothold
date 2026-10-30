"use client";
import { useEffect, useRef, useState } from "react";
import Brief from "./Brief";
import GradientField, { type Palette } from "./GradientField";
import { Magnetic } from "./ui";

type Entity = { id: string; name: string; type: string; hint?: string };
type City = { id: string; name: string; label: string };

const PALETTES: Record<string, Palette> = {
  restaurant: { a: [0.85, 0.27, 0.12], b: [1.0, 0.55, 0.25], c: [1, 0.8, 0.6] },
  cafe: { a: [0.55, 0.33, 0.15], b: [0.9, 0.65, 0.35], c: [1, 0.9, 0.7] },
  grocery: { a: [0.1, 0.45, 0.3], b: [0.35, 0.8, 0.5], c: [0.8, 1, 0.85] },
  bookshop: { a: [0.25, 0.2, 0.65], b: [0.55, 0.45, 0.95], c: [0.85, 0.8, 1] },
  salon: { a: [0.7, 0.15, 0.4], b: [1, 0.45, 0.65], c: [1, 0.8, 0.9] },
};
const BUSINESSES = Object.keys(PALETTES);
const STAGES = ["Reading the taste graph", "Mapping where taste concentrates", "Finding the venues they love", "Matching partners & vibe"];

async function get(path: string, q: string) {
  const r = await fetch(`${path}?q=${encodeURIComponent(q)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Request failed");
  return j.results;
}

/** Debounced lookup; `fire()` searches immediately (Enter). */
function useLookup<T>(q: string, path: string, onError: (m: string) => void) {
  const [opts, setOpts] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const run = async (query: string) => {
    const id = ++seq.current;
    setLoading(true);
    try { const r = await get(path, query); if (id === seq.current) setOpts(r); }
    catch (e: any) { if (id === seq.current) onError(e.message); }
    finally { if (id === seq.current) setLoading(false); }
  };
  useEffect(() => {
    if (q.trim().length < 3) { seq.current++; return; }
    const t = setTimeout(() => run(q.trim()), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const ok = q.trim().length >= 3;
  return { opts: ok ? opts : null, loading: ok && loading, fire: () => q.trim() && run(q.trim()), clear: () => { seq.current++; setOpts(null); } };
}

export default function Home() {
  const [business, setBusiness] = useState("restaurant");
  const [cityQ, setCityQ] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [anchorQ, setAnchorQ] = useState("");
  const [anchors, setAnchors] = useState<Entity[]>([]);
  const [brief, setBrief] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const briefRef = useRef<HTMLDivElement>(null);

  const cities = useLookup<City>(city ? "" : cityQ, "/api/city", setError);
  const found = useLookup<Entity>(anchors.length >= 5 ? "" : anchorQ, "/api/search", setError);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 1400);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    const p = PALETTES[business];
    const css = (c: number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
    document.documentElement.style.setProperty("--a", css(p.a));
    document.documentElement.style.setProperty("--b", css(p.b));
  }, [business]);

  const generate = async () => {
    setError(""); setBusy(true); setBrief(null);
    try {
      const r = await fetch("/api/brief", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ business, cityLabel: city!.label, anchors }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Request failed");
      setBrief(j);
      setTimeout(() => briefRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const energy = busy ? 1 : focus ? 0.45 : brief ? 0.25 : 0.15;
  const idx = BUSINESSES.indexOf(business);
  const ready = !!city && anchors.length > 0;

  return (
    <>
      <GradientField palette={PALETTES[business]} energy={energy} />
      <div className="veil" />
      <main>
        <header className="top"><span className="logo">Foothold</span><span className="mute">powered by Qloo taste graph</span></header>

        <section className="hero">
          <h1 className="display">Find your <em>foothold.</em></h1>
          <p className="lede">Tell us who your customers are by what they love. We’ll show you where in the city they actually live.</p>

          <div className="form" onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}>
            <div className="step"><span className="lab">I’m opening a</span>
              <div className="seg" style={{ "--i": idx, "--n": BUSINESSES.length } as React.CSSProperties}>
                <i className="thumb" />
                {BUSINESSES.map((b) => <button key={b} className={b === business ? "on" : ""} onClick={() => setBusiness(b)}>{b}</button>)}
              </div>
            </div>

            <div className="step"><span className="lab">in</span>
              {city ? (
                <button className="pill pop" onClick={() => { setCity(null); setCityQ(""); }}>{city.label} <b>×</b></button>
              ) : (
                <div className="field">
                  <input value={cityQ} placeholder="a city…" onChange={(e) => setCityQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cities.fire()} />
                  <span className={`sweep ${cities.loading ? "spin" : ""}`} />
                  {cities.opts && (
                    <div className="menu">
                      {cities.opts.length === 0 && <p className="err">Qloo doesn’t recognise that place. Check the spelling.</p>}
                      {cities.opts.map((c, i) => <button key={c.id} style={{ animationDelay: `${i * 40}ms` }} onClick={() => { setCity(c); cities.clear(); }}>{c.label}</button>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="step"><span className="lab">for people who love</span>
              <div className="anchors">
                {anchors.map((a) => <button key={a.id} className="pill pop" onClick={() => setAnchors(anchors.filter((x) => x.id !== a.id))}>{a.name} <b>×</b></button>)}
                {anchors.length < 5 && (
                  <div className="field grow">
                    <input value={anchorQ} placeholder={anchors.length ? "add another…" : "an artist, film, show, book, game, podcast, brand…"} onChange={(e) => setAnchorQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && found.fire()} />
                    <span className={`sweep ${found.loading ? "spin" : ""}`} />
                    {found.opts && (
                      <div className="menu">
                        {found.opts.length === 0 && <p className="err">No matches found.</p>}
                        {found.opts.map((e, i) => (
                          <button key={e.id} style={{ animationDelay: `${i * 40}ms` }} onClick={() => { if (!anchors.some((a) => a.id === e.id)) setAnchors([...anchors, e]); setAnchorQ(""); found.clear(); }}>
                            {e.name}<small>{(e.type ?? "").replace("urn:entity:", "").replace("videogame", "video game").replace("_", " ")}{e.hint ? ` · ${e.hint}` : ""}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="go">
              <Magnetic disabled={!ready || busy} onClick={generate} className={busy ? "busy" : ""}>{busy ? STAGES[stage] + "…" : "Show me where"}</Magnetic>
              {!ready && <span className="mute">Pick a city and at least one thing they love.</span>}
            </div>
            {error && <p className="err">{error}</p>}
          </div>
        </section>

        <div ref={briefRef}>{brief && <Brief b={brief} />}</div>
      </main>
    </>
  );
}
