import { NextRequest, NextResponse } from "next/server";
import { sfhdSources } from "@/lib/animesfhd";

export const runtime = "nodejs";

/**
 * GET /api/anime/sfhd-source?episodeId={id}
 * Resolve as fontes de vídeo de um episódio do animesfhd.net, já ordenadas
 * por preferência (CDN direta com CORS aberto → proxies AniStream/AniTube)
 * e com playUrl pronta para o player (direta ou via /api/hls).
 */
export async function GET(req: NextRequest) {
  const episodeId = (req.nextUrl.searchParams.get("episodeId") ?? "").trim();

  if (!episodeId || !/^\d+$/.test(episodeId)) {
    return NextResponse.json(
      { error: "Parâmetro 'episodeId' inválido" },
      { status: 400 },
    );
  }

  const result = await sfhdSources(episodeId);
  if (!result || result.sources.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma fonte de vídeo disponível para este episódio" },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
