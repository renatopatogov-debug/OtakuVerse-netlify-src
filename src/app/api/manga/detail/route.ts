import { NextRequest, NextResponse } from "next/server";
import { mangaDetail } from "@/lib/mangadex";
import { findKakaSlug, kakaChapters } from "@/lib/kakamanga";
import { enrichManga } from "@/lib/anilist";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const preferredLang = req.nextUrl.searchParams.get("lang")?.trim() || null;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { error: "Parâmetro 'id' (UUID do mangá) inválido" },
      { status: 400 },
    );
  }

  try {
    const forceSource = req.nextUrl.searchParams.get("source");
    // v2: resposta agora traz langTotals + chapters de UM idioma só.
    const data = await cached(
      `manga:detail:v3:${id}:${preferredLang ?? ""}`,
      5 * 60 * 1000,
      () => mangaDetail(id, preferredLang),
    );

    // Fallback de capítulos: se o MangaDex não tem NENHUM capítulo em
    // NENHUM idioma (ex.: Frieren — fonte oficial saiu do ar), tenta o
    // KakaManga usando o título como slug. Os ids vêm prefixados "kaka__".
    const allLangsEmpty =
      !data.langTotals ||
      Object.values(data.langTotals).every((n) => n <= 0);
    const needsKaka = allLangsEmpty || forceSource === "kaka";
    if (needsKaka) {
      const kakaSlug = await cached(
        `manga:kaka-slug:${data.manga.title}`,
        24 * 60 * 60 * 1000,
        () => findKakaSlug(data.manga.title),
      );
      if (kakaSlug) {
        const kaka = await cached(
          `manga:kaka-chapters:${kakaSlug}`,
          15 * 60 * 1000,
          () => kakaChapters(kakaSlug),
        );
        if (kaka.length > 0) {
          data.chapters = kaka;
          (data as { source?: string }).source = "kakamanga";
        }
      }
    }

    // Enriquecimento AniList: se o MangaDex não trouxe descrição (ou muito
    // curta), tenta pegar no AniList — oficial, estável, sem Cloudflare.
    if (!data.manga.description || data.manga.description.length < 40) {
      const al = await cached(
        `manga:al-desc:${data.manga.title}`,
        24 * 60 * 60 * 1000,
        () => enrichManga(data.manga.title),
      );
      if (al?.description) {
        data.manga.description = al.description;
        if (al.averageScore != null) {
          (data.manga as { anilistScore?: number | null }).anilistScore =
            al.averageScore;
        }
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
