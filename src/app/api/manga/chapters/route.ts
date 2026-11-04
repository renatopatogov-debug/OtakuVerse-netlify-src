import { NextRequest, NextResponse } from "next/server";
import { chaptersForLang } from "@/lib/mangadex";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Capítulos de um mangá em um idioma específico (busca sob demanda da UI). */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  const lang = req.nextUrl.searchParams.get("lang")?.trim() ?? "";

  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !lang) {
    return NextResponse.json(
      { error: "Parâmetros 'id' (UUID) e 'lang' obrigatórios" },
      { status: 400 },
    );
  }

  try {
    const data = await cached(`manga:chapters:${id}:${lang}`, 15 * 60 * 1000, () =>
      chaptersForLang(id, lang),
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
