import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchSkipTimes, SKIP_TTL_MS } from "@/lib/aniskip";

export const dynamic = "force-dynamic";

/**
 * GET /api/skip-times?malId=40748&ep=1&length=1420
 * Tempos de OP/ED do AniSkip (gratuito). Cache de 7 dias —
 * skip times são essencialmente estáticos por episódio.
 * Falha → { skip: null } com 200 (o player simplesmente não mostra o botão).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const malId = parseInt(searchParams.get("malId") ?? "", 10);
  const ep = parseInt(searchParams.get("ep") ?? "", 10);
  const length = parseFloat(searchParams.get("length") ?? "");
  if (!malId || !ep) {
    return NextResponse.json({ skip: null });
  }
  try {
    const skip = await cached(
      `aniskip:${malId}:${ep}:${Number.isFinite(length) ? Math.round(length) : 0}`,
      SKIP_TTL_MS,
      () => fetchSkipTimes(malId, ep, Number.isFinite(length) ? length : undefined),
    );
    return NextResponse.json({ skip });
  } catch {
    return NextResponse.json({ skip: null });
  }
}
