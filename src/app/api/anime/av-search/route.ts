import { NextRequest, NextResponse } from "next/server";
import { avSearchCached } from "@/lib/animevillage";

export const runtime = "nodejs";

/**
 * GET /api/anime/av-search?q={termo}
 * Busca no animevillage.org (4ª fonte alternativa, HLS com CORS aberto).
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json(
      { error: "Parâmetro 'q' (termo de busca) é obrigatório" },
      { status: 400 },
    );
  }

  try {
    const items = await avSearchCached(q);
    return NextResponse.json({ total: items.length, items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
