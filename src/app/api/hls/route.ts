import { NextRequest, NextResponse } from "next/server";
import { SFHD_MEDIA_SUFFIXES } from "@/lib/animesfhd";

export const runtime = "nodejs";

/**
 * GET /api/hls?u={url}
 * Proxy de playlists/segmentos HLS para fontes do animesfhd.net que não
 * expõem CORS aberto (AniStream/AniTube no próprio domínio). A CDN direta
 * (animesdigital / mywallpaper-4k-image.net) tem access-control-allow-origin: *
 * e não precisa deste proxy — o player usa a URL direta.
 *
 * Playlists (.m3u8) têm todas as URIs reescritas para voltarem por aqui;
 * segmentos (TS/MP4) são transmitidos em streaming com Range preservado.
 */

function hostAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return SFHD_MEDIA_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

function isHttpTarget(u: URL): boolean {
  return u.protocol === "https:" || u.protocol === "http:";
}

function proxied(absolute: string, origin: string): string {
  return `${origin}/api/hls?u=${encodeURIComponent(absolute)}`;
}

/** Reescreve URI="..." em tags como #EXT-X-KEY / #EXT-X-MAP. */
function rewriteAttrUris(line: string, base: URL, origin: string): string {
  return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
    try {
      const target = new URL(uri, base);
      if (!isHttpTarget(target)) return `URI="${uri}"`;
      return `URI="${proxied(target.toString(), origin)}"`;
    } catch {
      return `URI="${uri}"`;
    }
  });
}

function rewritePlaylist(text: string, baseUrl: string, origin: string): string {
  const base = new URL(baseUrl);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return rewriteAttrUris(trimmed, base, origin);
      }
      try {
        const target = new URL(trimmed, base);
        if (!isHttpTarget(target)) return line;
        return proxied(target.toString(), origin);
      } catch {
        return line;
      }
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const origin = req.nextUrl.origin;

  if (!u || !hostAllowed(u)) {
    return NextResponse.json({ error: "URL não permitida" }, { status: 403 });
  }

  let upstream: Response;
  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      Referer: "https://animesfhd.net/",
      Accept: "*/*",
    };
    const range = req.headers.get("range");
    if (range) headers.Range = range;

    upstream = await fetch(u, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Fonte de vídeo indisponível (timeout)" },
      { status: 504 },
    );
  }

  const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
  const looksPlaylist =
    contentType.includes("mpegurl") ||
    u.split("?")[0].toLowerCase().endsWith(".m3u8") ||
    (!contentType.includes("video") &&
      !contentType.includes("mp2t") &&
      !contentType.includes("octet-stream") &&
      contentType.startsWith("text/"));

  // Playlist → reescreve URIs (se o upstream devolveu lixo/erro em texto,
  // repassa o status original para o player tratar).
  if (upstream.ok && looksPlaylist) {
    try {
      const text = await upstream.text();
      if (!text.includes("#EXTM3U")) {
        const safeFallbackType = contentType.includes("html")
          ? "text/plain; charset=utf-8"
          : contentType || "text/plain";
        return new NextResponse(text, {
          status: upstream.status,
          headers: { "content-type": safeFallbackType },
        });
      }
      return new NextResponse(rewritePlaylist(text, u, origin), {
        status: 200,
        headers: {
          "content-type": "application/vnd.apple.mpegurl",
          "cache-control": "no-store",
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Falha ao ler playlist" },
        { status: 502 },
      );
    }
  }

  // Segmento / binário → streaming com Range preservado
  const headers = new Headers();
  for (const h of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
  ]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=8640000, immutable");
  }
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
