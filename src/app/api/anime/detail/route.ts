import { NextRequest, NextResponse } from "next/server";
import { fetchAnimeDetail } from "@/lib/otakulogia";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cid = Number(sp.get("cid"));
  const tidRaw = sp.get("tid");

  if (!Number.isFinite(cid) || cid <= 0) {
    return NextResponse.json(
      { error: "Parâmetro 'cid' (upstreamCid) inválido" },
      { status: 400 },
    );
  }
  const tid = tidRaw ? Number(tidRaw) : null;

  try {
    const data = await cached(
      `anime:detail:${cid}:${tid ?? "*"}`,
      15 * 60 * 1000,
      () => fetchAnimeDetail(cid, tid),
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
