import { NextRequest, NextResponse } from "next/server";
import {
  isHttpUrl,
  isSafeImageContentType,
  streamImageProxyResponse,
} from "@/lib/image-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Proxy de imagens do MangaDex e fontes de mangá.
 *
 * Por que existe: uploads.mangadex.org e nós do MangaDex estão bloqueados
 * por DNS/provedores no Brasil. Servindo pelo backend (same-origin), os
 * usuários conseguem visualizar capas e páginas normalmente.
 */

const ALLOWED_SUFFIXES = [".mangadex.org", ".mangadex.network", ".2xstorage.com"];

function isAllowed(raw: string): boolean {
  if (!isHttpUrl(raw)) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return ALLOWED_SUFFIXES.some(
      (s) => host === s.slice(1) || host.endsWith(s),
    );
  } catch {
    return false;
  }
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

  if (!isAllowed(u)) {
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

    const usable =
      upstream.ok &&
      isSafeImageContentType(upstream.headers.get("content-type"));

    // Fallback: se o nó voluntário do MangaDex At-Home falhou, tenta o CDN oficial da MangaDex
    if (!usable && isNetwork && u.includes("/data/")) {
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
        await upstream.body?.cancel().catch(() => {});
        upstream = fallbackRes;
      }
    }

    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      return NextResponse.json(
        { error: `MangaDex HTTP ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    return await streamImageProxyResponse(upstream, {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "Netlify-CDN-Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "Netlify-Vary": "query=u",
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
