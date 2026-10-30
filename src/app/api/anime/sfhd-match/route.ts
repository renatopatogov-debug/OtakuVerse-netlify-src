import { NextRequest, NextResponse } from "next/server";
import { sfhdMatchesByMal } from "@/lib/animesfhd";

export const runtime = "nodejs";

/**
 * GET /api/anime/sfhd-match?title={nome}&mal={malId}
 * Ponte precisa AniList/ani.zip ⇄ animesfhd: procura a série por título e
 * valida o casamento pelo MAL id (que a API do animesfhd expõe). Usada na
 * página de detalhe primária para oferecer a fonte HLS alternativa.
 *
 * Devolve `matches[]` (TODAS as séries validadas — legendada e dublada são
 * séries distintas na API) e `match` (primeira, por compatibilidade).
 */
export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get("title") ?? "").trim();
  const mal = Number((req.nextUrl.searchParams.get("mal") ?? "").trim());

  if (!title || !Number.isInteger(mal) || mal <= 0) {
    return NextResponse.json(
      { error: "Informe 'title' e 'mal' (MAL id numérico)" },
      { status: 400 },
    );
  }

  const matches = await sfhdMatchesByMal(title, mal);
  return NextResponse.json({ title, mal, matches, match: matches[0] ?? null });
}
