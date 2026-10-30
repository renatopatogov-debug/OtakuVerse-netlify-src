import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxy de imagens do MangaDex.
 *
 * Por que existe: uploads.mangadex.org e os nós do at-home server podem estar
 * inacessíveis na rede do usuário final (ISP, DNS, hotlink, headers do gateway
 * de preview). Servindo as imagens pelo nosso backend (same-origin), o
 * navegador do usuário nunca fala direto com o MangaDex.
 *
 * Segurança: whitelist estrita — hosts oficiais do MangaDex + CDN do
 * KakaManga (2xstorage.com, fonte fallback de capítulos):
 *   - *.mangadex.org    (cobre uploads.mangadex.org, capas)
 *   - *.mangadex.network (nós do at-home server, páginas dos capítulos)
 *   - *.2xstorage.com   (CDN de imagens do KakaManga)
 * Qualquer outro host é rejeitado com 400, evita virar proxy aberto.
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

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");

  if (!u) {
    return NextResponse.json(
      { error: "Parâmetro 'u' (URL da imagem) é obrigatório" },
      { status: 400 },
    );
  }

  // Só http(s) (nós do at-home podem devolver http://) e só hosts do MangaDex
  if (!/^https?:\/\//i.test(u) || !isAllowed(u)) {
    return NextResponse.json(
      { error: "Host não autorizado" },
      { status: 400 },
    );
  }

  try {
    // Headers por host (cada CDN é chato de um jeito):
    //  - 2xstorage (KakaManga): exige UA de navegador + Referer deles, senão 403.
    //  - uploads.mangadex.org: se Referer é de outro site, troca a capa por um
    //    placeholder genérico (mesma imagem pra qualquer URL!) → nunca mandar Referer.
    //  - *.mangadex.network (at-home): 404 em UAs de navegador completas → usar UA simples.
    const host = new URL(u).hostname.toLowerCase();
    const isKaka = host.endsWith("2xstorage.com");
    const upstream = await fetch(u, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": isKaka
          ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
          : "OtakuVerseDemo/1.0",
        ...(isKaka ? { Referer: "https://www.kakamanga.com/" } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `MangaDex HTTP ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    // Imagens do MangaDex são imutáveis (nome inclui hash) → cache agressivo
    headers.set("Cache-Control", "public, max-age=604800, immutable");

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.name === "TimeoutError"
            ? "Timeout ao buscar imagem no MangaDex"
            : "Falha ao buscar imagem",
      },
      { status: 504 },
    );
  }
}
