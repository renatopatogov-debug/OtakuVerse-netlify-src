import { NextRequest, NextResponse } from "next/server";
import { fetchLatestReleases } from "@/lib/otakulogia";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit") ?? 20) || 20));
  const audioType = sp.get("audioType") || null;

  try {
    const data = await cached(
      `anime:latest:${offset}:${limit}:${audioType ?? "*"}`,
      10 * 60 * 1000,
      () => fetchLatestReleases(offset, limit, audioType),
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
