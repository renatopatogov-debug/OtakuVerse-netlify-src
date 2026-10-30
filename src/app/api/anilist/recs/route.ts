import { NextRequest, NextResponse } from "next/server";
import { fetchAnimeRecs } from "@/lib/anilist";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const name = sp.get("name")?.trim() ?? "";
  const nameEn = sp.get("nameEn")?.trim() || null;
  if (!name && !nameEn) {
    return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
  }

  try {
    const items = await cached(
      `anilist:recs:v2:${nameEn ?? ""}:${name}`,
      60 * 60 * 1000,
      () => fetchAnimeRecs(name, nameEn),
    );
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
