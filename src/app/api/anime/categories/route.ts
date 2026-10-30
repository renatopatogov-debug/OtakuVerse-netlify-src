import { NextResponse } from "next/server";
import { fetchCategories } from "@/lib/otakulogia";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await cached("anime:categories", 60 * 60 * 1000, () =>
      fetchCategories(),
    );
    // Ordena por quantidade de animes (mais populosos primeiro)
    const items = [...data.items].sort((a, b) => b.animeCount - a.animeCount);
    return NextResponse.json({ total: data.total, items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      { status: 502 },
    );
  }
}
