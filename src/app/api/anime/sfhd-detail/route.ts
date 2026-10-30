import { NextRequest, NextResponse } from "next/server";
import { sfhdSeries } from "@/lib/animesfhd";

export const runtime = "nodejs";

/**
 * GET /api/anime/sfhd-detail?seriesId={id}
 * Detalhe completo de uma série do animesfhd.net: metadados (capa/backdrop
 * TMDB, gêneros, ano, áudio) + todos os episódios (paginado no upstream)
 * + MAL id quando conhecido.
 */
export async function GET(req: NextRequest) {
  const seriesId = (req.nextUrl.searchParams.get("seriesId") ?? "").trim();

  if (!seriesId || !/^\d+$/.test(seriesId)) {
    return NextResponse.json(
      { error: "Parâmetro 'seriesId' inválido" },
      { status: 400 },
    );
  }

  const detail = await sfhdSeries(seriesId);
  if (!detail) {
    return NextResponse.json(
      { error: "Série não encontrada na fonte animesfhd" },
      { status: 404 },
    );
  }

  return NextResponse.json(detail);
}
