import { NextRequest, NextResponse } from "next/server";
import { popularMangas } from "@/lib/mangadex";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const limit = Math.min(32, Math.max(1, Number(sp.get("limit") ?? 20) || 20));

  try {
    const data = await cached(
      `manga:popular:${offset}:${limit}`,
      15 * 60 * 1000,
      () => popularMangas(offset, limit),
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
