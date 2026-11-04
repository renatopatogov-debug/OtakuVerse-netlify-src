import { NextRequest, NextResponse } from "next/server";
import { matchTomatoAnime } from "@/lib/tomato";

export const runtime = "nodejs";

/**
 * GET /api/anime/tomato-match?title={nome}&audio={dub|leg}
 * Procura o anime na API do Tomato pelo título e devolve os casamentos
 * encontrados enriquecidos com temporadas (dublado/legendado).
 */
export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get("title") ?? "").trim();
  const audio = req.nextUrl.searchParams.get("audio");
  const audioPref = audio === "dub" || audio === "leg" ? audio : null;

  if (!title) {
    return NextResponse.json(
      { error: "Informe o parâmetro 'title'" },
      { status: 400 },
    );
  }

  try {
    const matches = await matchTomatoAnime(title, audioPref);
    return NextResponse.json({
      title,
      matches,
      match: matches[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Falha ao consultar Tomato",
        message: err instanceof Error ? err.message : String(err),
        matches: [],
        match: null,
      },
      { status: 200 },
    );
  }
}
