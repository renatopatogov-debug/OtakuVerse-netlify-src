import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchTrending } from "@/lib/anilist";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "8", 10) || 8, 1),
    20,
  );
  try {
    const items = await cached(
      `anilist:trending:${limit}`,
      30 * 60_000,
      () => fetchTrending(limit),
    );
    return NextResponse.json({ total: items.length, items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro AniList" },
      { status: 502 },
    );
  }
}
