import { NextRequest, NextResponse } from "next/server";
import { chapterPages, type ChapterPages } from "@/lib/mangadex";
import {
  isKakaChapterId,
  kakaPages,
  parseKakaChapterId,
} from "@/lib/kakamanga";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const chapterId = (req.nextUrl.searchParams.get("chapterId") ?? "").trim();

  if (!chapterId) {
    return NextResponse.json(
      { error: "Parâmetro 'chapterId' é obrigatório" },
      { status: 400 },
    );
  }

  // Fonte KakaManga (fallback): id no formato kaka__{slug}__{chapterSlug}
  if (isKakaChapterId(chapterId)) {
    const parsed = parseKakaChapterId(chapterId);
    if (!parsed) {
      return NextResponse.json(
        { error: "chapterId KakaManga malformado" },
        { status: 400 },
      );
    }
    try {
      const data = await cached(`manga:pages:${chapterId}`, 30 * 60 * 1000, async () => {
        const raw = await kakaPages(parsed.slug, parsed.chapterSlug);
        const result: ChapterPages = {
          chapterId,
          pages: raw.map(
            (u) => `/api/img?u=${encodeURIComponent(u)}`,
          ),
          total: raw.length,
        };
        return result;
      });
      return NextResponse.json(data);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erro inesperado" },
        { status: 502 },
      );
    }
  }

  // Fonte MangaDex (principal): id UUID
  if (!/^[0-9a-f-]{36}$/i.test(chapterId)) {
    return NextResponse.json(
      { error: "Parâmetro 'chapterId' (UUID ou id KakaManga) inválido" },
      { status: 400 },
    );
  }

  try {
    const data = await cached(`manga:pages:${chapterId}`, 30 * 60 * 1000, () =>
      chapterPages(chapterId),
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
