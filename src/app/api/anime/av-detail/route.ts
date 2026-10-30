import { NextRequest, NextResponse } from "next/server";
import { avDetailCached } from "@/lib/animevillage";

export const runtime = "nodejs";

/**
 * GET /api/anime/av-detail?slug={slug}
 * Detalhe (espelho AniList com idMal/banner/genres) + episódios
 * legendados e dublados do animevillage.org.
 */
export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim();
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json(
      { error: "Parâmetro 'slug' inválido" },
      { status: 400 },
    );
  }

  const result = await avDetailCached(slug);
  if (!result) {
    return NextResponse.json(
      { error: "Não foi possível carregar o detalhe no animevillage" },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
