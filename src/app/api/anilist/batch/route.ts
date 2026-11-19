import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchScores } from "@/lib/anilist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { titles: string[] } → { results: (number|null)[] }
 * Notas do AniList (averageScore 0-100) alinhadas por índice.
 * Enhancement only: em qualquer falha devolve results null com 200,
 * para nunca quebrar a UI das listas.
 */
export async function POST(req: Request) {
  let rawTitles: string[] = [];
  try {
    const body = await req.json();
    rawTitles = Array.isArray(body?.titles)
      ? body.titles
          .slice(0, 24)
          .map((t: unknown) => (typeof t === "string" ? t.trim() : ""))
      : [];
  } catch {
    return NextResponse.json({ results: null });
  }

  if (rawTitles.length === 0) return NextResponse.json({ results: [] });

  const valid = rawTitles
    .map((title, idx) => ({ title, idx }))
    .filter((v) => v.title.length > 0);
  if (valid.length === 0) {
    return NextResponse.json({ results: rawTitles.map(() => null) });
  }

  try {
    const key = `anilist:batch:${valid.map((v) => v.title.toLowerCase()).join("¦")}`;
    const scores = await cached(key, 12 * 3600_000, () =>
      fetchScores(valid.map((v) => v.title)),
    );
    const results: (number | null)[] = rawTitles.map(() => null);
    valid.forEach((v, i) => {
      results[v.idx] = scores[i] ?? null;
    });
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: rawTitles.map(() => null) });
  }
}
