import { NextRequest, NextResponse } from "next/server";
import { searchFallback } from "@/lib/fallback-anime";

export const runtime = "nodejs";

/**
 * GET /api/anime/fallback-search?q={termo}
 * Busca nas fontes alternativas (assistiranimesonline.net + animesonline.cloud)
 * — usada automaticamente quando a busca primária (Otakulogia) falha ou
 * não encontra nada.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json(
      { error: "Parâmetro 'q' é obrigatório" },
      { status: 400 },
    );
  }

  const items = await searchFallback(q);
  return NextResponse.json({ q, total: items.length, items });
}
