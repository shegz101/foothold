"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Fades/blur-ups its children when scrolled into view. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setOn(true), io.disconnect()), { threshold: 0.12 });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`rv ${on ? "in" : ""} ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>{children}</div>;
}

/** Glass card with a cursor-following spotlight. */
export function Spot({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}>
      {children}
    </div>
  );
}

/** Button that leans toward the cursor. */
export function Magnetic({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button ref={ref} {...p} className={`cta ${p.className ?? ""}`}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.12}px, ${(e.clientY - r.top - r.height / 2) * 0.2}px)`;
      }}
      onPointerLeave={() => { ref.current!.style.transform = ""; }}>
      <span>{children}</span>
    </button>
  );
}

/** Number that counts up once visible. */
export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (n: number) => {
        const k = Math.min(1, (n - t0) / 900);
        setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{v}{suffix}</span>;
}

/** Bar that grows when its parent .rv enters view (CSS-driven). */
export function Meter({ value }: { value: number }) {
  const w = Math.min(100, Math.abs(value) * 100);
  return <div className="meter"><i className={value < 0 ? "neg" : ""} style={{ "--w": `${w}%` } as CSSProperties} /></div>;
}
