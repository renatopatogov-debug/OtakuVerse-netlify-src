import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { enrichAnime } from "@/lib/anilist";
import {
  fetchAniZipMapping,
  ptBrTitle,
  type AniZipMapping,
} from "@/lib/anizip";

export const dynamic = "force-dynamic";

/**
 * GET /api/anilist/enrich?name=...&nameEn=...
 * Enriquecimento de um anime: dados do AniList (nota, gêneros, banner HD,
 * trailer, idMal) + título pt-BR e episódios localizados do ani.zip.
 * Falhas de enrich devolvem { media: null, anizip: null } com 200 —
 * a página de detalhe funciona sem enriquecimento.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") ?? "").trim();
  const nameEn = (searchParams.get("nameEn") ?? "").trim();
  if (!name && !nameEn) {
    return NextResponse.json(
      { error: "Informe name ou nameEn" },
      { status: 400 },
    );
  }

  const cacheKey = `anilist:enrich:${(nameEn || name).toLowerCase()}`;
  try {
    const result = await cached(cacheKey, 12 * 3600_000, async () => {
      const media = await enrichAnime(name, nameEn || null);
      let anizip: AniZipMapping | null = null;
      let titlePtBr: string | null = null;
      if (media?.id) {
        anizip = await fetchAniZipMapping(media.id);
        titlePtBr = ptBrTitle(anizip);
      }
      return { media, anizip, titlePtBr };
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        media: null,
        anizip: null,
        titlePtBr: null,
        error: e instanceof Error ? e.message : "Erro enrich",
      },
      { status: 200 },
    );
  }
}
