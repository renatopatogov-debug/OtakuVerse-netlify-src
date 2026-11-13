import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import {
  isHttpUrl,
  isSafeImageContentType,
  isSafePathSegment,
  validateImageUpstream,
} from "@/lib/image-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Placeholder SVG caso todas as APIs falhem (garante status 200 e nunca quebra o layout visual)
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="364" viewBox="0 0 256 364">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="50%" stop-color="#27272a"/>
      <stop offset="100%" stop-color="#3b0764"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="128" cy="182" r="32" fill="#71717a" opacity="0.3"/>
</svg>`;

async function fetchAniListCover(search?: string, alId?: string): Promise<string | null> {
  try {
    const isId = Boolean(alId && /^\d+$/.test(alId));
    const query = isId
      ? `query ($id: Int) { Media(id: $id, type: MANGA) { coverImage { extraLarge large } } }`
      : `query ($search: String) { Media(search: $search, type: MANGA) { coverImage { extraLarge large } } }`;
    const variables = isId ? { id: parseInt(alId!, 10) } : { search };

    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "OtakuVerseDemo/1.0",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { Media?: { coverImage?: { extraLarge?: string; large?: string } } };
    };
    const c = json?.data?.Media?.coverImage;
    return c?.extraLarge || c?.large || null;
  } catch {
    return null;
  }
}

async function fetchKitsuCover(search: string): Promise<string | null> {
  try {
    const url = `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(search)}&page[limit]=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "OtakuVerseDemo/1.0",
        Accept: "application/vnd.api+json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{ attributes?: { posterImage?: Record<string, string> } }>;
    };
    const p = json?.data?.[0]?.attributes?.posterImage;
    return p?.medium || p?.small || p?.original || null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ mangaId: string; fileName: string }> },
) {
  const { mangaId, fileName } = await props.params;

  if (!mangaId || !fileName || !/^[0-9a-f-]{36}$/i.test(mangaId)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const safeFile = fileName.replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!isSafePathSegment(safeFile)) {
    return NextResponse.json({ error: "Nome de capa inválido" }, { status: 400 });
  }
  const title = (req.nextUrl.searchParams.get("title") ?? "").trim();
  const alId = (req.nextUrl.searchParams.get("al") ?? "").trim();

  // Resolve a URL da capa com fallback em cadeia (AniList -> Kitsu -> MangaDex)
  // Só grava no cache quando encontra uma URL válida (não envenena com null).
  let resolvedCoverUrl: string | null = null;
  try {
    resolvedCoverUrl = await cached(`manga:resolved-cover:${mangaId}`, 24 * 60 * 60 * 1000, async () => {
      // 1. Fonte primária: AniList (alta definição, CDN Cloudflare ultrarrápida, sem rate-limit de imagem)
      if (alId || title) {
        const anilistUrl = await fetchAniListCover(title, alId);
        if (anilistUrl) return anilistUrl;
      }

      // 2. Fonte secundária: Kitsu (segunda base ampla sem restrições)
      if (title) {
        const kitsuUrl = await fetchKitsuCover(title);
        if (kitsuUrl) return kitsuUrl;
      }

      // 3. Fallback: MangaDex (com headers adequados de Referer e User-Agent)
      if (safeFile && safeFile !== "cover.jpg" && safeFile !== "default.jpg") {
        return `https://uploads.mangadex.org/covers/${mangaId}/${safeFile}`;
      }

      throw new Error("Nenhuma capa encontrada");
    });
  } catch {
    resolvedCoverUrl = null;
  }

  if (resolvedCoverUrl && isHttpUrl(resolvedCoverUrl)) {
    try {
      const host = new URL(resolvedCoverUrl).hostname.toLowerCase();
      const isMangaDex = host === "mangadex.org" || host.endsWith(".mangadex.org");
      const headers: Record<string, string> = {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "OtakuVerseDemo/1.0",
      };
      if (isMangaDex) {
        headers.Referer = "https://mangadex.org/";
      }

      let res = await fetch(resolvedCoverUrl, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(7000),
      });

      // Se o MangaDex falhar com arquivo redimensionado (.256.jpg / .512.jpg), tenta o original
      if (
        (!res.ok || !isSafeImageContentType(res.headers.get("content-type"))) &&
        isMangaDex &&
        (safeFile.includes(".256.jpg") || safeFile.includes(".512.jpg"))
      ) {
        const origFile = safeFile.replace(/\.(256|512)\.jpg$/, "");
        const origUrl = `https://uploads.mangadex.org/covers/${mangaId}/${origFile}`;
        const origRes = await fetch(origUrl, {
          headers,
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);

        if (origRes && origRes.ok && isSafeImageContentType(origRes.headers.get("content-type"))) {
          await res.body?.cancel().catch(() => {});
          res = origRes;
        }
      }

      if (res.ok) {
        const check = await validateImageUpstream(res);
        if (check.ok) {
          const contentType = res.headers.get("content-type") || "image/jpeg";
          return new NextResponse(res.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=604800, immutable",
              "Netlify-CDN-Cache-Control": "public, max-age=604800",
            },
          });
        }
      } else {
        await res.body?.cancel().catch(() => {});
      }
    } catch {
      // Falha de rede: cai no placeholder SVG abaixo
    }
  }

  // Placeholder SVG sem cache longo caso nenhuma fonte tenha respondido a tempo
  return new NextResponse(PLACEHOLDER_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "Netlify-CDN-Cache-Control": "no-store",
    },
  });
}
