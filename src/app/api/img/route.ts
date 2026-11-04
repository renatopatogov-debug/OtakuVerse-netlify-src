import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxy de imagens do MangaDex e fontes de mangá.
 *
 * Por que existe: uploads.mangadex.org e nós do MangaDex estão bloqueados
 * por DNS/provedores no Brasil. Servindo pelo backend (same-origin), os
 * usuários conseguem visualizar capas e páginas normalmente.
 */

const ALLOWED_SUFFIXES = [".mangadex.org", ".mangadex.network", ".2xstorage.com"];

function isAllowed(raw: string): boolean {
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ALLOWED_SUFFIXES.some(
    (s) => host === s.slice(1) || host.endsWith(s),
  );
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");

  if (!u) {
    return NextResponse.json(
      { error: "Parâmetro 'u' (URL da imagem) é obrigatório" },
      { status: 400 },
    );
  }

  if (!/^https?:\/\//i.test(u) || !isAllowed(u)) {
    return NextResponse.json(
      { error: "Host não autorizado" },
      { status: 400 },
    );
  }

  try {
    const host = new URL(u).hostname.toLowerCase();
    const isKaka = host.endsWith("2xstorage.com");
    const isNetwork = host.endsWith("mangadex.network");

    const reqHeaders: Record<string, string> = {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": isNetwork ? "OtakuVerseDemo/1.0" : BROWSER_UA,
    };
    if (isKaka) {
      reqHeaders.Referer = "https://www.kakamanga.com/";
    }

    let upstream = await fetch(u, {
      headers: reqHeaders,
      cache: "no-store",
      signal: AbortSignal.timeout(8_500),
    });

    // Fallback: se o nó voluntário do MangaDex At-Home falhou, tenta o CDN oficial da MangaDex
    if (!upstream.ok && isNetwork && u.includes("/data/")) {
      const fallbackUrl = u.replace(/^https?:\/\/[^/]+/, "https://uploads.mangadex.org");
      const fallbackRes = await fetch(fallbackUrl, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent": BROWSER_UA,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(6_000),
      }).catch(() => null);

      if (fallbackRes && fallbackRes.ok) {
        upstream = fallbackRes;
      }
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `MangaDex HTTP ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "image/jpeg";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.name === "TimeoutError"
            ? "Timeout ao buscar imagem"
            : "Falha ao buscar imagem",
      },
      { status: 504 },
    );
  }
}
