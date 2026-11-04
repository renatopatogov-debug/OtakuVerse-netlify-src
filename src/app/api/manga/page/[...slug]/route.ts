import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await props.params;

  if (!slug || slug.length < 2) {
    return NextResponse.json({ error: "Rota inválida" }, { status: 400 });
  }

  // --- Caso 1: KakaManga (/api/manga/page/kaka/{slug}/{chapterSlug}/{fileName}) ---
  if (slug[0] === "kaka" && slug.length >= 4) {
    const [, mangaSlug, chapterSlug, ...rest] = slug;
    const fileName = rest.join("/");
    const primaryUrl = `https://img-r1.2xstorage.com/${mangaSlug}/${chapterSlug}/${fileName}`;
    const fallbackUrl = `https://imgs-1.2xstorage.com/${mangaSlug}/${chapterSlug}/${fileName}`;

    try {
      let upstream = await fetch(primaryUrl, {
        headers: {
          "User-Agent": BROWSER_UA,
          Referer: "https://www.kakamanga.com/",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(9_000),
      });

      if (!upstream.ok) {
        const fbRes = await fetch(fallbackUrl, {
          headers: {
            "User-Agent": BROWSER_UA,
            Referer: "https://www.kakamanga.com/",
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(7_000),
        }).catch(() => null);

        if (fbRes && fbRes.ok) {
          upstream = fbRes;
        }
      }

      if (!upstream.ok) {
        return NextResponse.json(
          { error: `KakaManga image HTTP ${upstream.status}` },
          { status: upstream.status === 404 ? 404 : 502 },
        );
      }

      const buffer = await upstream.arrayBuffer();
      const contentType = upstream.headers.get("content-type") || "image/webp";

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=604800, immutable",
          "Netlify-CDN-Cache-Control": "public, max-age=604800",
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Falha ao carregar página do KakaManga" },
        { status: 504 },
      );
    }
  }

  // --- Caso 2: MangaDex At-Home (/api/manga/page/{hash}/{fileName}) ---
  const [hash, ...restFiles] = slug;
  const fileName = restFiles.join("/");

  if (!hash || !fileName) {
    return NextResponse.json({ error: "Parâmetros de página ausentes" }, { status: 400 });
  }

  const baseParam = req.nextUrl.searchParams.get("b");
  let validBaseUrl: string | null = null;
  if (baseParam) {
    try {
      const u = new URL(baseParam);
      const h = u.hostname.toLowerCase();
      if (h.endsWith(".mangadex.org") || h.endsWith(".mangadex.network")) {
        validBaseUrl = u.origin;
      }
    } catch {
      // Ignora baseUrl inválida
    }
  }

  const primaryUrl = validBaseUrl
    ? `${validBaseUrl}/data/${hash}/${fileName}`
    : `https://uploads.mangadex.org/data/${hash}/${fileName}`;

  const cdnFallbackUrl = `https://uploads.mangadex.org/data/${hash}/${fileName}`;
  const dataSaverUrl = validBaseUrl
    ? `${validBaseUrl}/data-saver/${hash}/${fileName}`
    : `https://uploads.mangadex.org/data-saver/${hash}/${fileName}`;

  try {
    let upstream = await fetch(primaryUrl, {
      headers: {
        "User-Agent": "OtakuVerseDemo/1.0",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_500),
    });

    // Se o nó At-Home falhou, tenta o CDN oficial da MangaDex
    if (!upstream.ok && primaryUrl !== cdnFallbackUrl) {
      const fb = await fetch(cdnFallbackUrl, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(7_000),
      }).catch(() => null);

      if (fb && fb.ok) {
        upstream = fb;
      }
    }

    // Se ainda falhar, tenta a versão compactada (data-saver)
    if (!upstream.ok) {
      const ds = await fetch(dataSaverUrl, {
        headers: {
          "User-Agent": "OtakuVerseDemo/1.0",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(6_000),
      }).catch(() => null);

      if (ds && ds.ok) {
        upstream = ds;
      }
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `MangaDex page HTTP ${upstream.status}` },
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
        "Netlify-CDN-Cache-Control": "public, max-age=604800",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Timeout ou falha ao carregar página de mangá" },
      { status: 504 },
    );
  }
}
