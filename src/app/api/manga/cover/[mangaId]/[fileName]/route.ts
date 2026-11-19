import { NextRequest, NextResponse } from "next/server";
import { similarity } from "@/lib/anilist";
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

const MIN_TITLE_SIMILARITY = 0.45;

function matchesSearchTitle(wanted: string, candidates: (string | null | undefined)[]): boolean {
  const q = wanted.trim();
  if (!q) return false;
  return candidates.some((c) => c && similarity(q, c) >= MIN_TITLE_SIMILARITY);
}

async function fetchAniListCover(search?: string, alId?: string): Promise<string | null> {
  try {
    const isId = Boolean(alId && /^\d+$/.test(alId));
    const query = isId
      ? `query ($id: Int) { Media(id: $id, type: MANGA) { coverImage { extraLarge large } } }`
      : `query ($search: String) { Media(search: $search, type: MANGA) { title { romaji english native } coverImage { extraLarge large } } }`;
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
      data?: {
        Media?: {
          title?: { romaji?: string | null; english?: string | null; native?: string | null };
          coverImage?: { extraLarge?: string; large?: string };
        };
      };
    };
    const m = json?.data?.Media;
    if (!m) return null;
    if (!isId && search) {
      const ok = matchesSearchTitle(search, [
        m.title?.english,
        m.title?.romaji,
        m.title?.native,
      ]);
      if (!ok) return null;
    }
    const c = m.coverImage;
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
      data?: Array<{
        attributes?: {
          canonicalTitle?: string | null;
          titles?: Record<string, string | undefined>;
          posterImage?: Record<string, string>;
        };
      }>;
    };
    const attrs = json?.data?.[0]?.attributes;
    if (!attrs) return null;
    const ok = matchesSearchTitle(search, [
      attrs.canonicalTitle,
      ...Object.values(attrs.titles ?? {}),
    ]);
    if (!ok) return null;
    const p = attrs.posterImage;
    return p?.medium || p?.small || p?.original || null;
  } catch {
    return null;
  }
}

async function fetchCoverImage(url: string, isMangaDex: boolean): Promise<Response | null> {
  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "User-Agent": "OtakuVerseDemo/1.0",
  };
  if (isMangaDex) {
    headers.Referer = "https://mangadex.org/";
  }
  const res = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  }).catch(() => null);
  return res;
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

  const hasMangaDexFile =
    Boolean(safeFile) && safeFile !== "cover.jpg" && safeFile !== "default.jpg";
  const mdCoverUrl = hasMangaDexFile
    ? `https://uploads.mangadex.org/covers/${mangaId}/${safeFile}`
    : null;

  // Resolve a URL da capa com fallback em cadeia (AniList -> Kitsu -> MangaDex)
  // Só grava no cache quando encontra uma URL válida (não envenena com null).
  let resolvedCoverUrl: string | null = null;
  try {
    resolvedCoverUrl = await cached(
      `manga:resolved-cover:v2:${mangaId}:${alId || title.toLowerCase()}`,
      24 * 60 * 60 * 1000,
      async () => {
        // 1. Fonte primária: AniList (alta definição, CDN Cloudflare ultrarrápida)
        if (alId || title) {
          const anilistUrl = await fetchAniListCover(title, alId);
          if (anilistUrl) return anilistUrl;
        }

        // 2. Fonte secundária: Kitsu (validado por similaridade de título)
        if (title) {
          const kitsuUrl = await fetchKitsuCover(title);
          if (kitsuUrl) return kitsuUrl;
        }

        // 3. Fallback: MangaDex oficial
        if (mdCoverUrl) return mdCoverUrl;

        throw new Error("Nenhuma capa encontrada");
      },
    );
  } catch {
    resolvedCoverUrl = mdCoverUrl;
  }

  const candidates = [
    ...(resolvedCoverUrl && isHttpUrl(resolvedCoverUrl) ? [resolvedCoverUrl] : []),
    ...(mdCoverUrl && mdCoverUrl !== resolvedCoverUrl ? [mdCoverUrl] : []),
  ];

  for (const candidateUrl of candidates) {
    try {
      const host = new URL(candidateUrl).hostname.toLowerCase();
      const isMangaDex = host === "mangadex.org" || host.endsWith(".mangadex.org");
      let res = await fetchCoverImage(candidateUrl, isMangaDex);

      // Se o MangaDex falhar com arquivo redimensionado (.256.jpg / .512.jpg), tenta o original
      if (
        res &&
        (!res.ok || !isSafeImageContentType(res.headers.get("content-type"))) &&
        isMangaDex &&
        (safeFile.includes(".256.jpg") || safeFile.includes(".512.jpg"))
      ) {
        const origFile = safeFile.replace(/\.(256|512)\.jpg$/, "");
        const origUrl = `https://uploads.mangadex.org/covers/${mangaId}/${origFile}`;
        const origRes = await fetchCoverImage(origUrl, true);
        if (origRes && origRes.ok && isSafeImageContentType(origRes.headers.get("content-type"))) {
          await res.body?.cancel().catch(() => {});
          res = origRes;
        }
      }

      if (res && res.ok) {
        const check = await validateImageUpstream(res);
        if (check.ok) {
          const contentType = res.headers.get("content-type") || "image/jpeg";
          return new NextResponse(res.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=604800, immutable",
              "Netlify-CDN-Cache-Control": "public, max-age=604800",
              "Netlify-Vary": "query=title|al",
            },
          });
        }
      } else {
        await res?.body?.cancel().catch(() => {});
      }
    } catch {
      // Tenta próximo candidato
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
