import { NextRequest, NextResponse } from "next/server";
import { sfhdSubtitleVtt } from "@/lib/animesfhd";

export const runtime = "nodejs";

/**
 * GET /api/anime/sfhd-sub?episodeId={id}
 * Legenda do episódio convertida para WebVTT (o anistream entrega .ass,
 * que os navegadores não renderizam nativamente). 404 quando não há
 * legenda disponível — o player simplesmente não mostra o <track>.
 */
export async function GET(req: NextRequest) {
  const episodeId = (req.nextUrl.searchParams.get("episodeId") ?? "").trim();

  if (!episodeId || !/^\d+$/.test(episodeId)) {
    return NextResponse.json(
      { error: "Parâmetro 'episodeId' inválido" },
      { status: 400 },
    );
  }

  const vtt = await sfhdSubtitleVtt(episodeId);
  if (!vtt) {
    return NextResponse.json(
      { error: "Legenda indisponível para este episódio" },
      { status: 404 },
    );
  }

  return new NextResponse(vtt, {
    status: 200,
    headers: {
      "content-type": "text/vtt; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
