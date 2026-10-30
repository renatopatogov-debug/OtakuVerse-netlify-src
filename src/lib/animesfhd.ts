// Cliente server-side da API do animesfhd.net — descoberta e validada ao vivo
// (worklog Tasks 7-8). API JSON pública SEM Cloudflare e SEM login:
//
//   /api/home?q={termo}&page=N     → catálogo paginado + BUSCA (q!) + sort
//   /api/series/{seriesId}?page=N  → metadados + episódios (per_page=100)
//   /api/episodes/{episodeId}      → sources[] de vídeo + MAL id + legendas
//
// Fontes de vídeo por episódio (ordem de saúde observada):
//   origin "animesdigital" → CDN Cloudflare DIRETO, HLS .m3u8 com
//     access-control-allow-origin: * (toca direto no hls.js, sem proxy!)
//   origin "anistream"/"anitube"/"animefire" → proxies no próprio
//     animesfhd.net (instáveis, 502/409 às vezes) → servimos via /api/hls
//
// Cuidado: ids de série/episódio podem exceder Number.MAX_SAFE_INTEGER
// (ex.: 4321896233282591) → todo JSON é pré-processado para tratar ints
// de 15+ dígitos como strings antes do JSON.parse.

import { cached } from "./cache";

/* ---------- Base ---------- */

const BASE = "https://animesfhd.net";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/** Hosts de mídia permitidos no player/proxy (sufixo). */
export const SFHD_MEDIA_SUFFIXES = [
  "animesfhd.net",
  "mywallpaper-4k-image.net",
];

function hostAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SFHD_MEDIA_SUFFIXES.some(
      (s) => host === s || host.endsWith(`.${s}`),
    );
  } catch {
    return false;
  }
}

/**
 * Parse defensivo: quota ints de 15+ dígitos ANTES do JSON.parse para não
 * perder precisão nos ids gigantes (séries/episódios/fontes da API).
 */
function parseSfhdJson<T>(text: string): T {
  return JSON.parse(
    text.replace(/"([A-Za-z_]\w*)":\s*(\d{15,})\b/g, '"$1":"$2"'),
  ) as T;
}

async function sfhdJson<T>(path: string, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      Referer: `${BASE}/`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`);
  return parseSfhdJson<T>(await res.text());
}

/* ---------- Tipos públicos ---------- */

export interface SfhdSearchItem {
  seriesId: string;
  title: string;
  altTitles: string[];
  description: string | null;
  coverUrl: string | null;
  backdropUrl: string | null;
  year: number | null;
  genres: string[];
  category: string | null; // legendado | dublado
  status: string | null;
  episodeCount: number;
}

export interface SfhdEpisode {
  id: string;
  number: number;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
}

export interface SfhdSeriesDetail {
  seriesId: string;
  title: string;
  altTitles: string[];
  description: string | null;
  coverUrl: string | null;
  backdropUrl: string | null;
  year: number | null;
  genres: string[];
  category: string | null;
  status: string | null;
  episodeCount: number;
  malId: number | null;
  episodes: SfhdEpisode[];
}

export interface SfhdSource {
  label: string;
  provider: string;
  origin: string;
  /** URL absoluta da playlist (como a API devolve). */
  url: string;
  /**
   * URL para o player: direta quando o host tem CORS aberto validado
   * (CDN animesdigital), senão via nosso proxy /api/hls.
   */
  playUrl: string;
  direct: boolean;
  /** URL de legenda (formato .ass via anistream) quando existir. */
  subtitleUrl: string | null;
}

export interface SfhdSourcesResult {
  episodeId: string;
  seriesId: string;
  seriesTitle: string;
  episodeNumber: number;
  title: string | null;
  malId: number | null;
  /** Legenda pronta para <track> (VTT no nosso domínio) ou null. */
  subtitleVttUrl: string | null;
  /** Já ordenada na ordem de preferência. */
  sources: SfhdSource[];
}

/* ---------- Normalização ---------- */

function splitAlt(s: unknown): string[] {
  return typeof s === "string" && s.trim()
    ? s
        .split(/\n|\|/)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
}

function splitGenres(s: unknown): string[] {
  return typeof s === "string" && s.trim()
    ? s
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
}

/* ---------- Busca (/api/home?q=) ---------- */

interface RawSeriesItem {
  id: string | number;
  title?: string;
  alt_titles?: string;
  description?: string;
  cover_image?: string;
  backdrop_image?: string;
  year?: number;
  genre?: string;
  category?: string;
  status?: string;
  episode_count?: number;
}

interface RawHome {
  series?: {
    series?: RawSeriesItem[];
    total?: number;
  };
}

function toSearchItem(it: RawSeriesItem): SfhdSearchItem {
  return {
    seriesId: String(it.id),
    title: (it.title ?? "").trim() || "Sem título",
    altTitles: splitAlt(it.alt_titles),
    description: it.description?.trim() || null,
    coverUrl: it.cover_image || null,
    backdropUrl: it.backdrop_image || null,
    year: typeof it.year === "number" ? it.year : null,
    genres: splitGenres(it.genre),
    category: it.category ?? null,
    status: it.status ?? null,
    episodeCount: typeof it.episode_count === "number" ? it.episode_count : 0,
  };
}

/** Busca por título na API do animesfhd (cache 30min). */
export async function sfhdSearch(q: string): Promise<SfhdSearchItem[]> {
  const term = q.trim();
  if (!term) return [];
  try {
    return await cached(`sfhd:search:${term.toLowerCase()}`, 30 * 60_000, async () => {
      const data = await sfhdJson<RawHome>(
        `/api/home?q=${encodeURIComponent(term)}`,
      );
      return (data.series?.series ?? []).map(toSearchItem);
    });
  } catch {
    return [];
  }
}

/* ---------- Detalhe da série (/api/series/{id}) ---------- */

interface RawSeriesDetail {
  id?: string | number;
  series?: RawSeriesItem & { mal_score?: number };
  mal?: { id?: number | string; episode_offset?: number };
  episodes?: {
    id: string | number;
    episode_number?: number;
    title?: string;
    description?: string;
    thumbnail_url?: string;
  }[];
  page?: number;
  has_more?: boolean;
  pages?: number;
}

async function sfhdSeriesRaw(seriesId: string): Promise<SfhdSeriesDetail> {
  if (!/^\d+$/.test(seriesId)) throw new Error("seriesId inválido");

  // Coleta todas as páginas de episódios (per_page=100). Guarda anti-loop:
  // se a API ignorar o page e repetir a página 1, dedupe por id e pare.
  const episodes = new Map<string, SfhdEpisode>();
  let meta: RawSeriesDetail | null = null;
  for (let page = 1; page <= 6; page++) {
    const data = await sfhdJson<RawSeriesDetail>(
      `/api/series/${seriesId}?page=${page}`,
    );
    meta = data;
    const list = data.episodes ?? [];
    if (list.length === 0) break;
    const before = episodes.size;
    for (const e of list) {
      const id = String(e.id);
      if (!episodes.has(id)) {
        episodes.set(id, {
          id,
          number: typeof e.episode_number === "number" ? e.episode_number : 0,
          title: e.title?.trim() || null,
          description: e.description?.trim() || null,
          thumbnailUrl: e.thumbnail_url || null,
        });
      }
    }
    if (!data.has_more || episodes.size === before) break;
  }

  if (!meta) throw new Error("série sem dados");
  const s = meta.series ?? ({} as RawSeriesItem);

  return {
    seriesId: String(meta.id ?? s.id ?? seriesId),
    title: (s.title ?? "").trim() || "Sem título",
    altTitles: splitAlt(s.alt_titles),
    description: s.description?.trim() || null,
    coverUrl: s.cover_image || null,
    backdropUrl: s.backdrop_image || null,
    year: typeof s.year === "number" ? s.year : null,
    genres: splitGenres(s.genre),
    category: s.category ?? null,
    status: s.status ?? null,
    episodeCount:
      typeof s.episode_count === "number"
        ? s.episode_count
        : episodes.size,
    malId:
      meta.mal?.id != null && Number.isFinite(Number(meta.mal.id))
        ? Number(meta.mal.id)
        : null,
    episodes: [...episodes.values()].sort((a, b) => a.number - b.number),
  };
}

/** Detalhe completo da série com todos os episódios (cache 6h). */
export async function sfhdSeries(
  seriesId: string,
): Promise<SfhdSeriesDetail | null> {
  try {
    return await cached(`sfhd:series:${seriesId}`, 6 * 3600_000, () =>
      sfhdSeriesRaw(seriesId),
    );
  } catch {
    return null;
  }
}

/* ---------- Fontes de vídeo (/api/episodes/{id}) ---------- */

interface RawEpisode {
  episode?: {
    id?: string | number;
    series_id?: string | number;
    series_title?: string;
    episode_number?: number;
    title?: string;
    subtitle_url?: string;
    mal?: { id?: number | string; episode?: number };
  };
  sources?: {
    label?: string;
    provider?: string;
    origin?: string;
    url?: string;
    subtitle_url?: string;
  }[];
}

function proxied(url: string): string {
  return `/api/hls?u=${encodeURIComponent(url)}`;
}

/**
 * Resolve as fontes de vídeo do episódio (cache 10min — a saúde das fontes
 * muda). CDN animesdigital (CORS * validado ao vivo) toca direto; as demais
 * origens passam pelo nosso proxy /api/hls.
 */
export async function sfhdSources(
  episodeId: string,
): Promise<SfhdSourcesResult | null> {
  if (!/^\d+$/.test(episodeId)) return null;
  try {
    return await cached(`sfhd:ep:${episodeId}`, 10 * 60_000, async () => {
      const data = await sfhdJson<RawEpisode>(`/api/episodes/${episodeId}`);
      const ep = data.episode ?? {};
      const order = ["animesdigital", "anistream", "anitube", "animefire"];
      const raw = (data.sources ?? []).filter((s) => s.url);

      const sources: SfhdSource[] = raw
        .map((s) => {
          const absolute = s.url!.startsWith("http")
            ? s.url!
            : `${BASE}${s.url!}`;
          const direct = s.url!.startsWith("http") && hostAllowed(absolute);
          return {
            label: s.label ?? "Player",
            provider: s.provider ?? s.origin ?? "?",
            origin: s.origin ?? "",
            url: absolute,
            playUrl: direct ? absolute : proxied(absolute),
            direct,
            subtitleUrl: s.subtitle_url
              ? s.subtitle_url.startsWith("http")
                ? s.subtitle_url
                : `${BASE}${s.subtitle_url}`
              : null,
          };
        })
        .sort(
          (a, b) =>
            (order.indexOf(a.origin) + 1 || order.length + 1) -
            (order.indexOf(b.origin) + 1 || order.length + 1),
        );

      if (sources.length === 0) return null;

      const hasSub = sources.some((s) => s.subtitleUrl);
      return {
        episodeId: String(ep.id ?? episodeId),
        seriesId: String(ep.series_id ?? ""),
        seriesTitle: ep.series_title?.trim() || "",
        episodeNumber:
          typeof ep.episode_number === "number" ? ep.episode_number : 0,
        title: ep.title?.trim() || null,
        malId:
          ep.mal?.id != null && Number.isFinite(Number(ep.mal.id))
            ? Number(ep.mal.id)
            : null,
        subtitleVttUrl: hasSub ? `/api/anime/sfhd-sub?episodeId=${episodeId}` : null,
        sources,
      };
    });
  } catch {
    return null;
  }
}

/* ---------- Legendas (ASS → VTT) ---------- */

/**
 * Converte legendas ASS (formato do anistream) em WebVTT que o <track>
 * nativo entende. Best-effort: remove tags de estilo {\...}, preserva \N
 * como quebra de linha e converte H:MM:SS.cc → MM:SS.mmm.
 */
export function sfhdAssToVtt(ass: string): string | null {
  const lines = ass.split(/\r?\n/);
  const cues: { start: string; end: string; text: string }[] = [];

  const toVttTime = (t: string): string | null => {
    const m = t.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
    if (!m) return null;
    const [, h, min, s, cs] = m;
    const total =
      Number(h) * 3600 + Number(min) * 60 + Number(s) + Number(cs.padEnd(3, "0")) / 1000;
    const hh = String(Math.floor(total / 3600)).padStart(2, "0");
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const ss = String(Math.floor(total % 60)).padStart(2, "0");
    const ms = String(Math.round((total % 1) * 1000)).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
  };

  for (const line of lines) {
    if (!line.startsWith("Dialogue:")) continue;
    const parts = line.slice("Dialogue:".length).split(",");
    if (parts.length < 10) continue;
    const start = toVttTime(parts[1]);
    const end = toVttTime(parts[2]);
    if (!start || !end) continue;
    const text = parts
      .slice(9)
      .join(",")
      .replace(/\{[^}]*\}/g, "") // tags de override {\i1} etc.
      .replace(/\\N/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text) continue;
    cues.push({ start, end, text });
  }

  if (cues.length === 0) return null;

  const body = cues
    .map((c) => `${c.start} --> ${c.end}\n${c.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

/** Busca a legenda do episódio e devolve VTT pronto (cache 1h). */
export async function sfhdSubtitleVtt(episodeId: string): Promise<string | null> {
  try {
    return await cached(`sfhd:sub:${episodeId}`, 3600_000, async () => {
      // sfhdSources já é cacheado (10min) — a conversão VTT é que vale 1h
      const src = await sfhdSources(episodeId);
      const subUrl = src?.sources.find((s) => s.subtitleUrl)?.subtitleUrl;
      if (!subUrl) return null;

      const res = await fetch(subUrl, {
        headers: { "User-Agent": UA, Referer: `${BASE}/` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const text = await res.text();
      if (text.startsWith("WEBVTT")) return text;
      if (text.includes("[Script Info]")) return sfhdAssToVtt(text);
      return null;
    });
  } catch {
    return null;
  }
}

/* ---------- Ponte MAL (match preciso por id) ---------- */

/**
 * Encontra a série do animesfhd correspondente a um MAL id: busca por
 * título e valida o mal.id de cada candidato (os detalhes ficam cacheados,
 * então validar 4 candidatos custa pouco depois da primeira vez).
 */
export async function sfhdMatchByMal(
  title: string,
  malId: number,
): Promise<SfhdSearchItem | null> {
  const all = await sfhdMatchesByMal(title, malId, 4);
  return all[0] ?? null;
}

/**
 * TODAS as séries do animesfhd validadas por MAL id (limitado a `max`),
 * na ordem encontrada — permite escolher entre a versão legendada e a
 * dublada (a API separa categorias em séries distintas).
 */
export async function sfhdMatchesByMal(
  title: string,
  malId: number,
  max = 4,
): Promise<SfhdSearchItem[]> {
  const term = title.trim();
  if (!term || !Number.isFinite(malId)) return [];
  try {
    return await cached(
      `sfhd:matchall:${malId}:${term.toLowerCase()}`,
      6 * 3600_000,
      async () => {
        const candidates = (await sfhdSearch(term)).slice(0, 8);
        const validated: SfhdSearchItem[] = [];
        for (const cand of candidates) {
          const detail = await sfhdSeries(cand.seriesId);
          if (detail?.malId === malId) {
            validated.push(cand);
            if (validated.length >= max) break;
          }
        }
        return validated;
      },
    );
  } catch {
    return [];
  }
}
