import { NextRequest, NextResponse } from "next/server";
import { avStreamCached } from "@/lib/animevillage";

export const runtime = "nodejs";

/**
 * GET /api/anime/av-stream?slug={slug}&ep={id}&category={sub|dub}
 * Fontes HLS do episódio no animevillage.org (CDN com CORS aberto —
 * o player toca direto, sem proxy) + legenda VTT + intro/outro.
 */
export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim();
  const ep = (req.nextUrl.searchParams.get("ep") ?? "").trim();
  const category =
    req.nextUrl.searchParams.get("category") === "dub" ? "dub" : "sub";

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json(
      { error: "Parâmetro 'slug' inválido" },
      { status: 400 },
    );
  }
  if (!ep || !/^\d+$/.test(ep)) {
    return NextResponse.json(
      { error: "Parâmetro 'ep' (id numérico do episódio) inválido" },
      { status: 400 },
    );
  }

  const stream = await avStreamCached(slug, ep, category);
  if (!stream || stream.sources.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nenhuma fonte de vídeo disponível (animevillage indisponível ou episódio sem stream)",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(stream);
}
