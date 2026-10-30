import { NextRequest, NextResponse } from "next/server";
import { fetchAnimesByCategory } from "@/lib/otakulogia";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const categoryId = sp.get("categoryId") ?? "";
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit") ?? 20) || 20));
  const audioType = sp.get("audioType") || null;

  if (!categoryId) {
    return NextResponse.json(
      { error: "Parâmetro 'categoryId' é obrigatório" },
      { status: 400 },
    );
  }

  try {
    const data = await cached(
      `anime:cat:${categoryId}:${offset}:${limit}:${audioType ?? "*"}`,
      10 * 60 * 1000,
      () => fetchAnimesByCategory(categoryId, offset, limit, audioType),
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
