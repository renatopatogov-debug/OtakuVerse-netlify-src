import { NextRequest, NextResponse } from "next/server";
import { fetchSearchAnimes } from "@/lib/otakulogia";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit") ?? 20) || 20));

  if (!q) {
    return NextResponse.json({ error: "Parâmetro 'q' é obrigatório" }, { status: 400 });
  }

  try {
    const data = await cached(
      `anime:search:${q}:${offset}:${limit}`,
      10 * 60 * 1000,
      () => fetchSearchAnimes(q, offset, limit),
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
