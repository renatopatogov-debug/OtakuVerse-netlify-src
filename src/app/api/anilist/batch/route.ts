import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchScores } from "@/lib/anilist";

export const dynamic = "force-dynamic";

/**
 * POST { titles: string[] } → { results: (number|null)[] }
 * Notas do AniList (averageScore 0-100) alinhadas por índice.
 * Enhancement only: em qualquer falha devolve results null com 200,
 * para nunca quebrar a UI das listas.
 */
export async function POST(req: Request) {
  let titles: string[] = [];
  try {
    const body = await req.json();
    titles = Array.isArray(body?.titles)
      ? body.titles
          .filter((t: unknown): t is string => typeof t === "string")
          .map((t: string) => t.trim())
          .filter(Boolean)
          .slice(0, 24)
      : [];
  } catch {
    return NextResponse.json({ results: null });
  }

  if (titles.length === 0) return NextResponse.json({ results: [] });

  try {
    const key = `anilist:batch:${titles.map((t) => t.toLowerCase()).join("¦")}`;
    const results = await cached(key, 12 * 3600_000, () => fetchScores(titles));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: titles.map(() => null) });
  }
}
