import { NextRequest, NextResponse } from "next/server";
import { anipDetail } from "@/lib/fallback-anime";

export const runtime = "nodejs";

/**
 * GET /api/anime/fallback-detail?slug={slug}
 * Detalhe de um anime da fonte alternativa assistiranimesonline.net:
 * sinopse, TMDB ID (→ vídeo via myembed), episódios com títulos pt-BR
 * e enriquecimento AniList (nota/gêneros/banner).
 */
export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim();

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json(
      { error: "Parâmetro 'slug' inválido" },
      { status: 400 },
    );
  }

  const detail = await anipDetail(slug);
  if (!detail) {
    return NextResponse.json(
      { error: "Anime não encontrado na fonte alternativa" },
      { status: 404 },
    );
  }

  return NextResponse.json(detail);
}
