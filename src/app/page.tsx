"use client";
import dynamic from "next/dynamic";

// Client-only: the page is fully interactive and animated, and rendering it in the browser avoids
// hydration mismatches caused by browser extensions that rewrite the server HTML.
const Home = dynamic(() => import("@/components/Home"), { ssr: false });

export default function Page() {
  return <Home />;
}
