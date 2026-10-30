"use client";
import { useState } from "react";
import HeatMap from "./HeatMap";
import { Meter, Reveal, Spot } from "./ui";

const pct = (v: number) => Math.round(Math.abs(v) * 100);
const AGE_ORDER = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];
const nice = (k: string) =>
  k === "24_and_younger" ? "24 & under" : k === "55_and_older" ? "55+" : k.replace(/_to_/g, "–").replace(/_/g, " ");
const byAge = (rows: any[]) => [...rows].sort((a, b) => AGE_ORDER.indexOf(a.label) - AGE_ORDER.indexOf(b.label));

function headline(b: any) {
  const ages = byAge(b.demographics.age.filter((a: any) => a.affinity > 0.15)).map((a: any) => nice(a.label));
  const g = b.demographics.gender[0];
  const lean = g && Math.abs(g.affinity) > 0.1 ? ` and lean ${g.label}` : "";
  return ages.length ? `Your customers skew ${ages.join(" and ")}${lean}.` : "Your customers don’t skew strongly by age.";
}

export default function Brief({ b }: { b: any }) {
  const [active, setActive] = useState<string | null>(null);
  const top = b.neighborhoods.map((n: any) => n.name);
  return (
    <section className="brief">
      <Reveal><p className="eyebrow">Market Entry Brief</p>
        <h2 className="display">{b.business} in <em>{b.city.split(",")[0]}</em></h2></Reveal>
      {b.gaps.map((g: string) => <p key={g} className="note">{g}</p>)}

      <Reveal delay={80}>
        <Spot>
          <p className="eyebrow">Who they are</p>
          <p className="big">{headline(b)}</p>
          <p className="mute">Averaged across {b.anchors.map((a: any) => a.name).join(", ")}. Bars show Qloo’s signed affinity: right of centre over-indexes, faded under-indexes.</p>
          <div className="two">
            {(["age", "gender"] as const).map((g) => (
              <div key={g} className="meters">
                {(g === "age" ? byAge(b.demographics.age) : b.demographics.gender).map((r: any) => (
                  <div className="mrow" key={r.label}>
                    <span>{nice(r.label)}</span><Meter value={r.affinity} />
                    <span className="mute">{r.affinity < 0 ? "−" : "+"}{pct(r.affinity)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Spot>
      </Reveal>

      <Reveal delay={80}>
        <Spot>
          <p className="eyebrow">Where they are</p>
          <p className="big">{b.neighborhoods.length ? `${b.neighborhoods.length} neighborhoods hold this audience.` : "Qloo has too little location data here to rank neighborhoods."}</p>
          <div className="mapwrap">
            <HeatMap cells={b.cells} active={active} onActive={setActive} labels={top} />
            <ol className="rank">
              {b.neighborhoods.map((n: any) => (
                <li key={n.name} className={active === n.name ? "on" : ""} onPointerEnter={() => setActive(n.name)} onPointerLeave={() => setActive(null)}>
                  <b>{n.name}</b>
                  <span className="mute">{n.hotCells} of the 60 hottest cells</span>
                  {n.venues[0] && <small>{n.venues.slice(0, 2).map((v: any) => v.name).join(" · ")}</small>}
                </li>
              ))}
            </ol>
          </div>
          <p className="mute">Each glow is one of Qloo’s {b.heatmapCells.toLocaleString()} mapped cells; the brightest 150 are drawn, the hottest 60 ranked.</p>
        </Spot>
      </Reveal>

      <Reveal>
        <p className="eyebrow pad">Venues they already love</p>
        <div className="venues">
          {b.venueAreas.slice(0, 6).flatMap((a: any) => a.venues.slice(0, 2).map((v: any) => ({ ...v, area: a.name }))).slice(0, 8).map((v: any, i: number) => {
            const total = v.drivers.reduce((s: number, d: any) => s + d.score, 0) || 1;
            return (
              <Reveal key={v.id} delay={i * 50}>
                <Spot className="venue">
                  <p className="mute">{v.area}</p>
                  <h3>{v.website ? <a href={v.website} target="_blank" rel="noreferrer">{v.name}</a> : v.name}</h3>
                  <div className="stack">{v.drivers.map((d: any, j: number) => <i key={d.anchor} style={{ flex: d.score / total, opacity: 1 - j * 0.22 }} title={`${d.anchor} ${pct(d.score)}%`} />)}</div>
                  <p className="mute tiny">{v.drivers.map((d: any) => d.anchor).join(" · ")}</p>
                  <p className="mute tiny">{v.priceLevel != null ? `Price level ${v.priceLevel}` : "Price not provided by Qloo"}{v.locations > 1 ? ` · chain, ${v.locations} matching locations` : ""}</p>
                </Spot>
              </Reveal>
            );
          })}
        </div>
      </Reveal>

      <div className="two">
        <Reveal><Spot><p className="eyebrow">Partner brands</p>
          <div className="chips">{b.partners.brands.map((x: any) => <span className="chip" key={x.id}>{x.name}</span>)}</div></Spot></Reveal>
        <Reveal delay={80}><Spot><p className="eyebrow">Sound &amp; ads</p>
          <div className="chips">{b.partners.artists.slice(0, 6).map((x: any) => <span className="chip" key={x.id}>♪ {x.name}</span>)}
            {b.partners.podcasts.slice(0, 3).map((x: any) => <span className="chip" key={x.id}>◉ {x.name}</span>)}</div></Spot></Reveal>
      </div>

      <Reveal><Spot><p className="eyebrow">Shop vibe</p>
        <div className="chips">{b.vibe.slice(0, 10).map((v: any, i: number) => <span className="chip float" style={{ animationDelay: `${i * 0.3}s` }} key={v.id}>{v.name}</span>)}</div></Spot></Reveal>

      <p className="note">Everything above is from Qloo and describes what groups tend to like, not what one person will do. The permits and licences checklist (not from Qloo) isn’t available yet.</p>
    </section>
  );
}
