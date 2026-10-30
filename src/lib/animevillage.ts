// Fonte animevillage.org — 4ª alternativa do OtakuVerse (worklog Task 10).
//
// Descoberta via engenharia reversa do front (Next.js + React Query):
//   /api/search?search={q}&page=&perPage=    → busca REAL (AniList-shaped,
//     com idMal + slug) — o parâmetro é "search", NÃO "q" (q é ignorado!)
//   /api/anime/{slug|id}                     → detalhe espelho AniList
//     (idMal, bannerImage, genres, averageScore, studios, trailer...)
//   /api/anime/{slug}/seasons                → main/seasons/movies/specials
//   /api/episodes/{slug}?dub={bool}          → eps [{id: "slug?ep=NNNN", n, t}]
//   /api/stream/{slug}?category={sub|dub}&server=hd-1&ep={NNNN}
//     → { sources:[{url m3u8}], subtitles:[{url vtt}], intro:{start,end},
//         outro:{start,end}, headers:{Referer, Origin megaplay.buzz} }
//
// Vídeo: HLS em fetch.nexabloom.top com access-control-allow-origin: *
// (testado) → toca DIRETO no HlsPlayer, sem proxy. Legendas VTT também
// com CORS aberto.
//
// Pegadinha: o Cloudflare do site às vezes serve challenge (HTML) para IP
// de datacenter → toda resposta passa por guard de JSON + retry curto; se
// não rolar, a fonte "apaga" da cadeia e as outras cobrem.

import { cached } from "./cache";

/* ---------- Tipos ---------- */

export interface AvSearchItem {
  slug: string;
  anilistId: number | null;
  malId: number | null;
  title: string;
  titleEnglish: string | null;
  posterUrl: string | null;
  format: string | null;
  episodes: number | null;
  year: number | null;
  synonyms: string[];
}

export interface AvDetail {
  slug: string;
  anilistId: number | null;
  malId: number | null;
  title: string;
  titleEnglish: string | null;
  synopsis: string | null;
  posterUrl: string | null;
  bannerUrl: string | null;
  genres: string[];
  averageScore: number | null;
  year: number | null;
  format: string | null;
  status: string | null;
  totalEpisodes: number | null;
}

export interface AvEpisode {
  /** número puro do parâmetro "ep" (2142) — é o que o /api/stream come */
  epId: string;
  number: number;
  title: string | null;
}

export interface AvStreamSource {
  playUrl: string;
  direct: boolean; // true → CORS aberto, player usa direto
  label: string;
  provider: string;
}

export interface AvStream {
  sources: AvStreamSource[];
  subtitleVttUrl: string | null;
  subtitleLang: string | null;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

/* ---------- Base ---------- */

const BASE = "https://www.animevillage.org";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/**
 * Hosts de mídia do animevillage (sufixo) — usados pelo proxy /api/hls.
 * IMPORTANTE: o CDN (nexabloom) e as legendas (eclipseharbor) exigem
 * Referer/Origin https://megaplay.buzz/ (validado ao vivo: sem ele, 403) —
 * o proxy anexa esses headers, o navegador não consegue.
 */
export const AV_MEDIA_SUFFIXES = ["nexabloom.top", "eclipseharbor.world", "mistyhorizon.space"];
export const AV_REFERER = "https://megaplay.buzz/";

/**
 * Hosts de mídia vistos EM RESPOSTAS REAIS do /api/stream (a CDN deles
 * troca de domínio: nexabloom → mistyhorizon → ...). O proxy /api/hls
 * aceita os sufixos conhecidos + qualquer host registrado aqui — nunca
 * input do usuário, então não vira proxy aberto.
 */
export const avAllowedHosts = new Set<string>();

/** Envelopa uma URL de mídia pro proxy do server (headers corretos lá). */
function proxied(url: string): string {
  return `/api/hls?u=${encodeURIComponent(url)}`;
}

function looksLikeChallenge(text: string): boolean {
  const head = text.slice(0, 200).toLowerCase();
  return (
    head.includes("<!doctype html") ||
    head.includes("<!doctype") ||
    head.includes("cloudflare") ||
    head.includes("just a moment")
  );
}

async function getJson<T>(url: string, tries = 3): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          // Referer do próprio site: o endpoint /api/anime/{id} numérico
          // HANGA sem ele (validado ao vivo — 25s sem resposta vs 200 na hora)
          Referer: `${BASE}/`,
          Origin: BASE,
        },
        cache: "no-store",
        // 9s: a rede às vezes PENDURA conexão (pior caso 3×9s antes de
        // falhar honestamente); desafio de Cloudflare falha rápido e
        // reaproveita as tentativas seguintes.
        signal: AbortSignal.timeout(9_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (looksLikeChallenge(text)) {
        throw new Error("Cloudflare challenge (HTML em vez de JSON)");
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // Cloudflare engole a 1ª tentativa às vezes — retry curto
      if (attempt < tries - 1) await new Promise((r) => setTimeout(r, 900));
    }
  }
  throw lastErr ?? new Error("Falha desconhecida no animevillage");
}

function pickTitle(t: {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
} | null | undefined): { title: string; english: string | null } {
  if (!t) return { title: "Sem título", english: null };
  const title = t.english?.trim() || t.romaji?.trim() || t.native?.trim() || "Sem título";
  const english = t.english?.trim() ?? null;
  return { title, english };
}

interface AvMediaRaw {
  id?: string | number | null;
  idMal?: number | null;
  slug?: string | null;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  coverImage?: { extraLarge?: string | null; large?: string | null; medium?: string | null } | null;
  bannerImage?: string | null;
  description?: string | null;
  genres?: string[] | null;
  averageScore?: number | null;
  seasonYear?: number | null;
  startDate?: { year?: number | null } | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  synonyms?: string[] | null;
}

/* ---------- Busca ---------- */

function mapSearchItem(m: AvMediaRaw): AvSearchItem | null {
  // A API é inconsistente: alguns pools vêm COM slug, outros só com id
  // numérico (espelho AniList). Sem slug, usamos o id como chave — o
  // endpoint /api/anime/{id} aceita os dois e devolve o slug real.
  const slug =
    typeof m.slug === "string" && m.slug
      ? m.slug
      : m.id != null && String(m.id).trim()
        ? String(m.id).trim()
        : null;
  if (!slug) return null;
  const { title, english } = pickTitle(m.title);
  const poster =
    m.coverImage?.extraLarge ?? m.coverImage?.large ?? m.coverImage?.medium ?? null;
  return {
    slug,
    anilistId: typeof m.id === "number" ? m.id : null,
    malId: typeof m.idMal === "number" ? m.idMal : null,
    title,
    titleEnglish: english,
    posterUrl: poster,
    format: m.format ?? null,
    episodes: typeof m.episodes === "number" ? m.episodes : null,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    synonyms: Array.isArray(m.synonyms) ? m.synonyms.slice(0, 8) : [],
  };
}

/** Busca real no animevillage (parâmetro correto: search=). */
export async function avSearch(q: string, perPage = 16): Promise<AvSearchItem[]> {
  const term = q.trim();
  if (!term) return [];
  const url = `${BASE}/api/search?search=${encodeURIComponent(term)}&page=1&perPage=${perPage}`;
  const json = await getJson<{ data?: { Page?: { media?: AvMediaRaw[] } } }>(url);
  const media = json.data?.Page?.media ?? [];
  const items = media
    .map(mapSearchItem)
    .filter((x): x is AvSearchItem => x !== null)
    // Items só-com-id-numérico apontam pro backend "HiAnime" deles, que
    // fica fora do ar com frequência (streaming server down) — os de slug
    // (pool megaplay) são confiáveis → slug primeiro no resultado.
    .sort((a, b) => Number(/^\d+$/.test(a.slug)) - Number(/^\d+$/.test(b.slug)));
  return items;
}

/* ---------- Detalhe ---------- */

/** Detalhe completo (espelho AniList) por slug. */
export async function avDetail(slug: string): Promise<AvDetail> {
  const url = `${BASE}/api/anime/${encodeURIComponent(slug)}`;
  const json = await getJson<{ data?: { Media?: AvMediaRaw } }>(url);
  const m = json.data?.Media;
  if (!m) throw new Error("Anime não encontrado no animevillage");
  const { title, english } = pickTitle(m.title);
  const poster =
    m.coverImage?.extraLarge ?? m.coverImage?.large ?? m.coverImage?.medium ?? null;
  const synopsis = m.description
    ? m.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : null;
  return {
    slug: typeof m.slug === "string" && m.slug ? m.slug : slug,
    anilistId: typeof m.id === "number" ? m.id : null,
    malId: typeof m.idMal === "number" ? m.idMal : null,
    title,
    titleEnglish: english,
    synopsis: synopsis || null,
    posterUrl: poster,
    bannerUrl: m.bannerImage ?? null,
    genres: Array.isArray(m.genres) ? m.genres : [],
    averageScore: typeof m.averageScore === "number" ? m.averageScore : null,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    format: m.format ?? null,
    status: m.status ?? null,
    totalEpisodes: typeof m.episodes === "number" ? m.episodes : null,
  };
}

/* ---------- Episódios ---------- */

interface AvEpisodesRaw {
  totalEpisodes?: number;
  episodes?: { id?: string; number?: number; title?: string }[] | null;
}

/**
 * Lista de episódios. `dub=false` → legendado (padrão), `dub=true` →
 * dublado quando o site tiver.
 */
export async function avEpisodes(
  slug: string,
  dub = false,
): Promise<{ total: number; episodes: AvEpisode[] }> {
  const url = `${BASE}/api/episodes/${encodeURIComponent(slug)}?dub=${dub ? "true" : "false"}`;
  const json = await getJson<AvEpisodesRaw>(url);
  const raw = json.episodes ?? [];
  const episodes: AvEpisode[] = raw
    .map((e) => {
      const m = /(?:\?|&)ep=(\d+)/.exec(e.id ?? "");
      const num = typeof e.number === "number" ? e.number : Number(m?.[1] ?? 0);
      return {
        epId: m?.[1] ?? "",
        number: Number.isFinite(num) ? num : 0,
        title: e.title?.trim() || null,
      };
    })
    .filter((e) => e.epId && e.number > 0)
    .sort((a, b) => a.number - b.number);
  return { total: json.totalEpisodes ?? episodes.length, episodes };
}

/* ---------- Stream ---------- */

interface AvStreamRaw {
  sources?: { url?: string; quality?: string; isM3U8?: boolean }[] | null;
  subtitles?: { url?: string; lang?: string; label?: string }[] | null;
  intro?: { start?: number; end?: number } | null;
  outro?: { start?: number; end?: number } | null;
}

/** Fontes de vídeo do episódio (HLS com CORS aberto — player direto). */
export async function avStream(
  slug: string,
  epId: string,
  category: "sub" | "dub" = "sub",
  server = "hd-1",
): Promise<AvStream> {
  if (!/^\d+$/.test(epId)) throw new Error("epId inválido");
  const url = `${BASE}/api/stream/${encodeURIComponent(
    slug,
  )}?category=${category}&server=${server}&ep=${epId}`;
  const json = await getJson<AvStreamRaw>(url);

  const sources: AvStreamSource[] = (json.sources ?? [])
    .filter(
      (s): s is { url?: string; quality?: string; isM3U8?: boolean } & {
        url: string;
      } => typeof s?.url === "string" && s.url.length > 0,
    )
    .map((s) => ({
      // O CDN exige Referer megaplay.buzz → SEMPRE via /api/hls (o server
      // anexa os headers; direto do navegador dá 403, validado no E2E).
      playUrl: proxied(s.url),
      direct: false,
      label: s.quality ?? "default",
      provider: "AV",
    }));

  const sub = (json.subtitles ?? []).find((s) => typeof s.url === "string");
  if (sources.length === 0) {
    throw new Error("Stream sem fontes de vídeo (não cacheia)");
  }

  // Registra os hosts de mídia desta resposta (playlist, segmentos e
  // legendas podem morar em CDNs diferentes e rotativos)
  for (const raw of [
    ...json.sources?.map((x) => x.url) ?? [],
    ...(sub?.url ? [sub.url] : []),
  ]) {
    try {
      avAllowedHosts.add(new URL(raw as string).hostname.toLowerCase());
    } catch {
      /* URL inválida — ignora */
    }
  }

  return {
    sources,
    subtitleVttUrl: sub?.url ? proxied(sub.url) : null,
    subtitleLang: sub?.lang ?? null,
    intro:
      json.intro && typeof json.intro.start === "number"
        ? { start: json.intro.start, end: json.intro.end ?? 0 }
        : null,
    outro:
      json.outro && typeof json.outro.start === "number"
        ? { start: json.outro.start, end: json.outro.end ?? 0 }
        : null,
  };
}

/* ---------- Versões com cache (usadas pelas rotas) ---------- */

// Padrão anti-envenenamento: resultado VAZIO é tratado como falha (throw) —
// o cached() não grava nada e a próxima chamada tenta de novo. Assim uma
// janela ruim de Cloudflare não deixa a fonte "morta" por minutos.

/** Busca com cache de 30 min — nunca envenena com vazio. */
export async function avSearchCached(q: string): Promise<AvSearchItem[]> {
  try {
    return await cached(`av:search:${q.trim().toLowerCase()}`, 30 * 60_000, async () => {
      const items = await avSearch(q);
      if (items.length === 0) throw new Error("av: busca vazia (não cacheia)");
      return items;
    });
  } catch {
    return [];
  }
}

/** Detalhe + episódios (sub e dub) com cache de 6h. */
export async function avDetailCached(
  slug: string,
): Promise<{ detail: AvDetail; sub: AvEpisode[]; dub: AvEpisode[] } | null> {
  try {
    return await cached(`av:detail:${slug}`, 6 * 60 * 60_000, async () => {
      const detail = await avDetail(slug);
      // Slug REAL (o search às vezes entrega só o id numérico; o detail
      // devolve o slug canônico — episódios/stream exigem ele).
      const realSlug = detail.slug || slug;
      const [sub, dub] = await Promise.all([
        avEpisodes(realSlug, false).catch(() => ({ total: 0, episodes: [] as AvEpisode[] })),
        avEpisodes(realSlug, true).catch(() => ({ total: 0, episodes: [] as AvEpisode[] })),
      ]);
      if (sub.episodes.length === 0 && dub.episodes.length === 0) {
        throw new Error("av: nenhum episódio (não cacheia)");
      }
      return { detail: { ...detail, slug: realSlug }, sub: sub.episodes, dub: dub.episodes };
    });
  } catch {
    return null;
  }
}

/** Stream com cache curto (10 min — URLs de CDN podem rotacionar). */
export async function avStreamCached(
  slug: string,
  epId: string,
  category: "sub" | "dub",
): Promise<AvStream | null> {
  try {
    return await cached(`av:stream:${slug}:${epId}:${category}`, 10 * 60_000, () =>
      avStream(slug, epId, category),
    );
  } catch {
    return null;
  }
}
