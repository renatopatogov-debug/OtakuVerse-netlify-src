import { NextRequest, NextResponse } from "next/server";
import { sfhdSearch } from "@/lib/animesfhd";

export const runtime = "nodejs";

/**
 * GET /api/anime/sfhd-search?q={termo}
 * Busca no catálogo do animesfhd.net (via /api/home?q=, sem autenticação).
 * Fonte alternativa com HLS direto (CDN com CORS aberto) e MAL id.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json(
      { error: "Parâmetro 'q' é obrigatório" },
      { status: 400 },
    );
  }

  const items = await sfhdSearch(q);
  return NextResponse.json({ q, total: items.length, items });
}
