import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ mangaId: string; fileName: string }> },
) {
  const { mangaId, fileName } = await props.params;

  if (!mangaId || !fileName || !/^[0-9a-f-]{36}$/i.test(mangaId)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  // Sanitiza fileName para evitar path traversal
  const safeFile = fileName.replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!safeFile) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  const coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${safeFile}`;

  try {
    let upstream = await fetch(coverUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": BROWSER_UA,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_500),
    });

    // Se falhar e tinha .256.jpg ou .512.jpg, tenta o arquivo original sem o sufixo
    if (!upstream.ok && (safeFile.includes(".256.jpg") || safeFile.includes(".512.jpg"))) {
      const origFile = safeFile.replace(/\.(256|512)\.jpg$/, "");
      const origUrl = `https://uploads.mangadex.org/covers/${mangaId}/${origFile}`;
      const origRes = await fetch(origUrl, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent": BROWSER_UA,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(6_000),
      }).catch(() => null);

      if (origRes && origRes.ok) {
        upstream = origRes;
      }
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `MangaDex cover HTTP ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "image/jpeg";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.name === "TimeoutError"
            ? "Timeout ao buscar capa"
            : "Falha ao buscar capa",
      },
      { status: 504 },
    );
  }
}
