import { NextRequest, NextResponse } from "next/server";
import {
  getTomatoEpisodeStream,
  resolveTomatoEpisodeStream,
} from "@/lib/tomato";

export const runtime = "nodejs";

/**
 * GET /api/anime/tomato-source?episodeId={id}
 * OU
 * GET /api/anime/tomato-source?animeId={id}&epNumber={n}&seasonNumber={s}&audio={dub|leg}
 *
 * Resolve fontes de vídeo (1080p FHD, 720p, 480p) na API do Tomato.
 */
export async function GET(req: NextRequest) {
  const episodeIdStr = req.nextUrl.searchParams.get("episodeId");

  // Caso 1: ID direto do episódio
  if (episodeIdStr && /^\d+$/.test(episodeIdStr)) {
    const episodeId = Number.parseInt(episodeIdStr, 10);
    const data = await getTomatoEpisodeStream(episodeId);
    if (!data || data.sources.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma fonte de vídeo encontrada para este episódio no Tomato" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      episodeId,
      episodeNumber: data.episodeNumber ?? 0,
      episodeTitle: data.episodeTitle ?? null,
      sources: data.sources,
    });
  }

  // Caso 2: Resolução por Anime ID + Episódio + Temporada + Preferência de Áudio
  const animeIdStr = req.nextUrl.searchParams.get("animeId");
  const epNumStr = req.nextUrl.searchParams.get("epNumber");
  const seasonNumStr = req.nextUrl.searchParams.get("seasonNumber");
  const audio = req.nextUrl.searchParams.get("audio");

  const animeId = animeIdStr ? Number.parseInt(animeIdStr, 10) : 0;
  const epNumber = epNumStr ? Number.parseInt(epNumStr, 10) : 0;
  const seasonNumber = seasonNumStr ? Number.parseInt(seasonNumStr, 10) : 1;
  const audioPref = audio === "dub" || audio === "leg" ? audio : null;

  if (!animeId || !epNumber) {
    return NextResponse.json(
      {
        error:
          "Informe 'episodeId' OU ('animeId' e 'epNumber') para buscar streams do Tomato",
      },
      { status: 400 },
    );
  }

  try {
    const result = await resolveTomatoEpisodeStream({
      animeId,
      seasonNumber,
      episodeNumber: epNumber,
      audioPref,
    });

    if (!result || result.sources.length === 0) {
      return NextResponse.json(
        { error: "Episódio ou fontes não encontrados no Tomato" },
        { status: 404 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Falha ao resolver stream do Tomato",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
