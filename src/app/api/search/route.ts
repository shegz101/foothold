import { NextResponse } from "next/server";
import { searchEntities } from "@/lib/foothold";
import { allow, visitorId } from "@/lib/ratelimit";

export async function GET(req: Request) {
  if (!allow(visitorId(req), 120)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  try {
    return NextResponse.json({ results: await searchEntities(q) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
