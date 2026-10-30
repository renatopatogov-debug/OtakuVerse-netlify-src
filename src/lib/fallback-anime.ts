// Fallback de animes para o OtakuVerse — fontes alternativas quando a
// Otakulogia (fonte primária) estiver fora do ar ou sem resultados.
//
// Fontes (engenharia reversa out/2026, ver worklog Tasks 5-6):
//   1. animesonline.cloud  → WordPress/DooPlay com wp-json aberto:
//       /wp-json/dooplay/search?keyword=X&nonce=N
//       JSON { "<id>": { title, url, img, extra:{date, imdb} } }
//       O nonce fica no HTML de qualquer página (config do live-search).
//       Não expõe episódios via REST → usada só como busca.
//   2. assistiranimesonline.net → app PHP custom, catálogo server-rendered:
//       /animes/?pagina=N (catálogo com TMDB IDs nos posters)
//       /anime/{slug} (detalhe com TODOS os eps + títulos pt-BR nos alts)
//       Sem busca server-side → filtramos o catálogo localmente.
//       O TMDB ID de cada título constrói o embed de vídeo:
//       https://myembed.biz/serie/{tmdbId}/{temporada}/{episodio}
//       (aceita referer externo; bloqueia apenas navegação direta sem referer)

//   3. animesfhd.net → API JSON pública SEM login (worklog Task 7):
//       /api/home?q={termo}       → busca + catálogo paginado
//       /api/series/{seriesId}    → metadados + episódios + MAL id
//       /api/episodes/{episodeId} → fontes HLS (CDN com CORS aberto + proxies)
//       matching preciso com AniList/ani.zip via MAL id

import { cached } from "./cache";
import { enrichAnime, type AniListMedia } from "./anilist";
import { sfhdSearch } from "./animesfhd";

/* ---------- Tipos ---------- */

export interface FallbackSearchItem {
  source: "anip" | "cloud" | "sfhd";
  slug: string; // anip: slug do anime; cloud: id numérico do wp-json; sfhd: seriesId
  title: string;
  posterUrl: string | null;
  year: string | null;
  score: string | null; // imdb (cloud) ou null (anip/sfhd)
  tmdbId: number | null; // só anip
  externalUrl: string | null; // só cloud (abrimos a fonte em nova aba)
}

export interface FallbackEpisode {
  number: number;
  title: string | null;
}

export interface FallbackDetail {
  source: "anip";
  slug: string;
  title: string;
  synopsis: string | null;
  posterUrl: string | null;
  tmdbId: number | null;
  episodes: FallbackEpisode[];
  anilist: {
    id: number;
    score: number | null;
    genres: string[];
    bannerImage: string | null;
  } | null;
}

/* ---------- Utilidades ---------- */

const ANIP = "https://assistiranimesonline.net";
const CLOUD = "https://animesonline.cloud";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function getText(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.text();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** URL do embed de vídeo a partir do TMDB ID (fonte assistiranimesonline). */
export function myEmbedUrl(
  tmdbId: number,
  season: number,
  episode: number,
): string {
  return `https://myembed.biz/serie/${tmdbId}/${season}/${episode}`;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ---------- Fonte 1: animesonline.cloud (busca via wp-json) ---------- */

interface NonceBox {
  value: string | null;
  at: number;
}
const nonceBox: NonceBox = { value: null, at: 0 };
const NONCE_TTL = 6 * 60 * 60 * 1000;

async function cloudNonce(force = false): Promise<string> {
  if (!force && nonceBox.value && Date.now() - nonceBox.at < NONCE_TTL) {
    return nonceBox.value;
  }
  const html = await getText(CLOUD + "/");
  const m =
    html.match(/dooplay\/search\/?","glossary":"[^"]*","nonce":"([a-f0-9]{8,12})"/) ??
    html.match(/"nonce":"([a-f0-9]{8,12})"/);
  if (!m) throw new Error("nonce do animesonline.cloud não encontrado");
  nonceBox.value = m[1];
  nonceBox.at = Date.now();
  return nonceBox.value;
}

async function cloudSearchRaw(q: string): Promise<FallbackSearchItem[]> {
  const nonce = await cloudNonce();
  const url = `${CLOUD}/wp-json/dooplay/search?keyword=${encodeURIComponent(q)}&nonce=${nonce}`;
  const raw = await getText(url);
  const json = JSON.parse(raw) as Record<
    string,
    { title: string; url: string; img: string; extra?: { date?: string; imdb?: string } }
  >;
  return Object.entries(json)
    .filter(([, v]) => v?.title?.trim())
    .map(([id, v]) => ({
    source: "cloud" as const,
    slug: id,
    title: decodeEntities(v.title ?? "").trim(),
    posterUrl: v.img ?? null,
    year: v.extra?.date ?? null,
    score: v.extra?.imdb ?? null,
    tmdbId: null,
    externalUrl: v.url ?? null,
  }));
}

/** Busca no animesonline.cloud com renovação automática de nonce. */
export async function cloudSearch(q: string): Promise<FallbackSearchItem[]> {
  try {
    return await cloudSearchRaw(q);
  } catch (e) {
    // 403 de nonce expirado → força renovação e tenta 1x de novo
    if (e instanceof Error && /403|nonce/i.test(e.message)) {
      try {
        return await cloudSearchRaw(q);
      } catch {
        return [];
      }
    }
    return [];
  }
}

/* ---------- Fonte 2: assistiranimesonline.net (catálogo HTML) ---------- */

interface AnipEntry {
  slug: string;
  title: string;
  tmdbId: number | null;
}

async function fetchTextRetry(url: string, tries = 2): Promise<string | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await getText(url);
    } catch {
      if (attempt < tries - 1) await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return null;
}

/** Catálogo via sitemaps oficiais do site (2 requests cobrem ~2379 títulos). */
async function anipCatalogFromSitemaps(): Promise<AnipEntry[]> {
  const out = new Map<string, AnipEntry>();
  for (const part of ["animes-sitemap1.xml", "animes-sitemap2.xml"]) {
    const xml = await fetchTextRetry(`${ANIP}/${part}`);
    if (!xml) continue;
    for (const m of xml.matchAll(
      /<loc>\s*https:\/\/[^<]*\/anime\/([a-z0-9-]+)\/?\s*<\/loc>/g,
    )) {
      const slug = m[1];
      if (!out.has(slug)) {
        out.set(slug, { slug, title: humanizeSlug(slug), tmdbId: null });
      }
    }
  }
  return [...out.values()];
}

/** Fallback do catálogo: varre as páginas /animes/ (~120 títulos recentes). */
async function anipCatalogFromPages(): Promise<AnipEntry[]> {
  const out = new Map<string, AnipEntry>();
  for (let page = 1; page <= 5; page++) {
    const html = await fetchTextRetry(`${ANIP}/animes/?pagina=${page}`);
    if (!html) break; // página falhou → usa o que já temos
    for (const m of html.matchAll(
      /href="\/anime\/([a-z0-9-]+)"[\s\S]{0,300}?assets\/media\/animes\/(\d+)\//g,
    )) {
      const slug = m[1];
      if (!out.has(slug)) {
        out.set(slug, { slug, title: humanizeSlug(slug), tmdbId: Number(m[2]) });
      }
    }
    for (const t of html.matchAll(
      /href="\/anime\/([a-z0-9-]+)"[^>]*>\s*([^<]{2,120})\s*<\/a>/g,
    )) {
      const entry = out.get(t[1]);
      if (entry && entry.title === humanizeSlug(t[1])) {
        const title = decodeEntities(t[2]).trim();
        if (title && !/^\d+$/.test(title)) entry.title = title;
      }
    }
    if (!html.includes(`pagina=${page + 1}`)) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  return [...out.values()];
}

async function anipCatalogRaw(): Promise<AnipEntry[]> {
  // 1ª opção: sitemaps (catálogo completo). 2ª: páginas navegáveis (parcial).
  const fromSitemaps = await anipCatalogFromSitemaps();
  const catalog =
    fromSitemaps.length > 50 ? fromSitemaps : await anipCatalogFromPages();
  if (catalog.length === 0) {
    throw new Error("catálogo anip vazio (fonte bloqueando?)");
  }
  return catalog;
}

/** Catálogo completo do assistiranimesonline (cache 12h — ~3 requests). */
export async function anipCatalog(): Promise<AnipEntry[]> {
  try {
    return await cached("fallback:anip:catalog", 12 * 60 * 60 * 1000, anipCatalogRaw);
  } catch {
    return [];
  }
}

export async function anipSearch(q: string): Promise<FallbackSearchItem[]> {
  const norm = normalize(q);
  if (!norm) return [];
  const catalog = await anipCatalog();
  return catalog
    .filter((e) => normalize(e.slug).includes(norm) || normalize(e.title).includes(norm))
    .slice(0, 24)
    .map((e) => ({
      source: "anip" as const,
      slug: e.slug,
      title: e.title === e.slug ? humanizeSlug(e.slug) : e.title,
      posterUrl: e.tmdbId ? `${ANIP}/assets/media/animes/${e.tmdbId}/${e.slug}.jpg` : null,
      year: null,
      score: null,
      tmdbId: e.tmdbId,
      externalUrl: null,
    }));
}

function humanizeSlug(slug: string): string {
  return decodeEntities(
    slug
      .split("-")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" "),
  );
}

async function anipDetailRaw(slug: string): Promise<FallbackDetail> {
  const html = await getText(`${ANIP}/anime/${encodeURIComponent(slug)}`);

  const title =
    decodeEntities(html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "").replace(
      /\s*[-–|].*$/,
      "",
    ) || humanizeSlug(slug);

  const synopsis =
    decodeEntities(
      (html.match(
        /<div[^>]*class="[^"]*synopsis[^"]*"[^>]*>([\s\S]{50,4000}?)<\/div>/,
      ) || [])[1] ?? "",
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || null;

  // BÔNUS 1: layout novo do site — o caminho do poster carrega o ID do TMDB
  // ex.: /assets/media/animes/37854/one-piece.jpg → tmdbId 37854 (One Piece!)
  // Layout antigo: poster direto do TMDB (image.tmdb.org) sem ID numérico
  const posterPath = html.match(
    /\/assets\/media\/animes\/(\d+)\/[a-z0-9-]+\.(?:jpg|webp|png)/,
  );
  const tmdbId = posterPath ? Number(posterPath[1]) : null;
  const tmdbDirectPoster = html.match(
    /https:\/\/image\.tmdb\.org\/t\/p\/(?:w500|original)\/[A-Za-z0-9]+\.(?:jpg|webp|png)/,
  );

  const epSlugs = [
    ...new Set(
      [...html.matchAll(/\/episodio\/([a-z0-9-]+-episodio-\d+)/g)].map((m) => m[1]),
    ),
  ];
  const epTitles = new Map<string, string>();
  for (const m of html.matchAll(
    /assets\/media\/animes\/\d+\/episodes\/([a-z0-9-]+-episodio-\d+)\.(?:jpg|webp|png)[\s\S]{0,120}?alt="([^"]+)"/g,
  )) {
    epTitles.set(m[1], decodeEntities(m[2]));
  }
  const episodes: FallbackEpisode[] = epSlugs
    .map((s) => ({
      number: Number(s.match(/(\d+)$/)?.[1] ?? 0),
      title: epTitles.get(s) ?? null,
    }))
    .sort((a, b) => a.number - b.number);

  return {
    source: "anip",
    slug,
    title,
    synopsis,
    posterUrl: posterPath
      ? `${ANIP}${posterPath[0]}`
      : tmdbDirectPoster
        ? tmdbDirectPoster[0]
        : null,
    tmdbId,
    episodes,
    anilist: null,
  };
}

/** Detalhe do assistiranimesonline + enriquecimento AniList (cache 6h). */
export async function anipDetail(slug: string): Promise<FallbackDetail | null> {
  const key = `fallback:anip:detail:${slug}`;
  try {
    return await cached(key, 6 * 60 * 60 * 1000, async () => {
      const detail = await anipDetailRaw(slug);
      // Enriquecimento AniList por título (nota, gêneros, banner)
      let anilist: FallbackDetail["anilist"] = null;
      try {
        const media: AniListMedia | null = await enrichAnime(detail.title);
        if (media) {
          anilist = {
            id: media.id,
            score: media.averageScore,
            genres: media.genres ?? [],
            bannerImage: media.bannerImage,
          };
        }
      } catch {
        /* enriquecimento é opcional */
      }
      return { ...detail, anilist };
    });
  } catch {
    return null;
  }
}

/* ---------- Cadeia resiliente ---------- */

/**
 * Busca em todas as fontes alternativas: animesfhd primeiro (API JSON com
 * HLS direto), assistiranimesonline depois (catálogo local com TMDB ID →
 * vídeo), por fim animesonline.cloud (busca real, milhares de títulos).
 * Caches separados por fonte para que uma falha momentânea de uma delas
 * não contamine a outra.
 */
export async function searchFallback(q: string): Promise<FallbackSearchItem[]> {
  const term = q.trim();
  if (!term) return [];
  const norm = normalize(term);

  // sfhd: busca real na API (barata, cache 30min) — fonte com vídeo HLS
  let sfhd: FallbackSearchItem[] = [];
  try {
    const raw = await cached(`fallback:sfhd:${norm}`, 30 * 60_000, () =>
      sfhdSearch(term),
    );
    sfhd = raw
      .filter((it) => it.title && it.title !== "Sem título")
      .slice(0, 12)
      .map((it) => ({
        source: "sfhd" as const,
        slug: it.seriesId,
        title: it.title,
        posterUrl: it.coverUrl,
        year: it.year != null ? String(it.year) : null,
        score: null,
        tmdbId: null,
        externalUrl: null,
      }));
  } catch {
    /* sfhd indisponível */
  }

  // cloud: cache por query, mas só quando traz algo (evita envenenar cache
  // com vazio se o nonce falhar num instante ruim)
  let cloud: FallbackSearchItem[] = [];
  try {
    const raw = await cached(`fallback:cloud:${norm}`, 30 * 60 * 1000, () =>
      cloudSearch(term),
    );
    if (raw.length > 0) cloud = raw;
  } catch {
    /* cloud indisponível */
  }

  // anip: usa o catálogo cacheado (12h) e filtra localmente — barato
  const anip = await anipSearch(term);

  return [...sfhd, ...anip, ...cloud].slice(0, 30);
}
