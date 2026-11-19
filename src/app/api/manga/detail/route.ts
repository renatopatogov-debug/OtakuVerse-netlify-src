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
    const raw = await cached(
      `manga:detail:v3:${id}:${preferredLang ?? ""}`,
      5 * 60 * 1000,
      () => mangaDetail(id, preferredLang),
    );
    // Clona antes de enriquecer para nunca mutar o objeto compartilhado no cache.
    const data: typeof raw & {
      source?: string;
      manga: typeof raw.manga & { anilistScore?: number | null };
    } = {
      ...raw,
      manga: { ...raw.manga },
    };

    // Fallback de capítulos: se o MangaDex não tem NENHUM capítulo em
    // NENHUM idioma (ex.: Frieren — fonte oficial saiu do ar), tenta o
    // KakaManga usando o título canônico em inglês primeiro, depois o título principal.
    const allLangsEmpty =
      !data.langTotals ||
      Object.values(data.langTotals).every((n) => n <= 0);
    const needsKaka = allLangsEmpty || forceSource === "kaka";
    const lookupTitle = (data.manga.altTitleEn ?? "").trim() || data.manga.title;
    if (needsKaka) {
      const findSlug = async (title: string) =>
        cached(
          `manga:kaka-slug:${title}`,
          24 * 60 * 60 * 1000,
          () => findKakaSlug(title),
        );
      let kakaSlug = await findSlug(lookupTitle);
      if (!kakaSlug && lookupTitle !== data.manga.title) {
        kakaSlug = await findSlug(data.manga.title);
      }
      if (kakaSlug) {
        const kaka = await cached(
          `manga:kaka-chapters:${kakaSlug}`,
          15 * 60 * 1000,
          () => kakaChapters(kakaSlug),
        );
        if (kaka.length > 0) {
          data.chapters = kaka;
          data.source = "kakamanga";
          data.loadedLang = "en";
          data.langTotals = { ...data.langTotals, en: kaka.length };
        }
      }
    }

    // Enriquecimento AniList: se o MangaDex não trouxe descrição (ou muito
    // curta), tenta pegar no AniList — oficial, estável, sem Cloudflare.
    if (!data.manga.description || data.manga.description.length < 40) {
      const al = await cached(
        `manga:al-desc:${lookupTitle}`,
        24 * 60 * 60 * 1000,
        () => enrichManga(lookupTitle),
      );
      if (al?.description) {
        data.manga.description = al.description;
        if (al.averageScore != null) {
          data.manga.anilistScore = al.averageScore;
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
