import { NextResponse } from "next/server";
import { buildBrief, BUSINESS_TAGS } from "@/lib/foothold";
import { allow, visitorId } from "@/lib/ratelimit";

export async function POST(req: Request) {
  if (!allow(visitorId(req), Number(process.env.BRIEF_LIMIT_PER_HOUR || 10))) return NextResponse.json({ error: "Brief limit reached; try again later" }, { status: 429 });
  const body = await req.json().catch(() => null);
  const anchors = body?.anchors;
  if (!body?.cityLabel || !(body.business in BUSINESS_TAGS) || !Array.isArray(anchors) || anchors.length < 1 || anchors.length > 5)
    return NextResponse.json({ error: "business, cityLabel and 1-5 anchors required" }, { status: 400 });
  try {
    return NextResponse.json(await buildBrief({ business: body.business, cityLabel: body.cityLabel, anchors }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
