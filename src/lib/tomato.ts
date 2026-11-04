// Cliente server-side da API do Tomato (Tomato Animes)
// Baseado na engenharia reversa do Kamirama-Plugin / Nuvio.
// API JSON limpa que fornece streams de vídeo diretos (1080p FHD, 720p MHD, 480p SHD)
// em HLS (.m3u8) ou MP4, com temporadas separadas para Dublado e Legendado.

import { cached } from "./cache";

const BASES = [
  "https://prod-api.tomatoanimes.com",
  "https://edge.betomato.com",
];

// Token JWT do aplicativo Tomato Android (pode ser sobrescrito via env TOMATO_TOKEN)
const DEFAULT_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTYwNjA4NjUsInV1aWQiOiJkYTljZTViZi1jODU1LTQ2NTAtYTc0MC05NGNiZTAwM2YzZTEiLCJpYXQiOjE3ODgzMDI3NzJ9.MmkgEfO3S3HNvmYfHIS1PsTqb5uJmpBAPfTuyesLYO0";

export const TOMATO_TOKEN = process.env.TOMATO_TOKEN || DEFAULT_TOKEN;

/* ---------- Tipos ---------- */

export interface TomatoSearchItem {
  id: number;
  name: string;
  episodes: number;
  date?: string;
  image?: string;
  tags?: string;
}

export interface TomatoSeason {
  season_id: number;
  season_name: string;
  season_number: number;
  season_dubbed: number; // 0 = legendado, 1 = dublado
  season_episodes: number;
}

export interface TomatoAnimeDetails {
  anime_id: number;
  anime_name: string;
  anime_synopsis?: string;
  anime_cover?: string;
  anime_year?: string;
}

export interface TomatoAnimeFull {
  anime_details: TomatoAnimeDetails;
  anime_seasons: TomatoSeason[];
}

export interface TomatoEpisodeItem {
  ep_id: number;
  ep_name: string;
  ep_number: number;
  ep_thumbnail?: string;
  ep_lenght_minutes?: number;
}

export interface TomatoPlayerSource {
  label: string;
  provider: string;
  playUrl: string;
  direct: boolean;
}

export interface TomatoStreamResult {
  animeId: number;
  seasonId: number;
  episodeId: number;
  episodeNumber: number;
  episodeTitle?: string;
  isDubbed: boolean;
  sources: TomatoPlayerSource[];
}

export interface TomatoMatchItem {
  id: number;
  name: string;
  year?: number | null;
  coverUrl?: string | null;
  episodeCount: number;
  score: number;
  seasons: {
    id: number;
    name: string;
    number: number;
    dubbed: boolean;
    episodesCount: number;
  }[];
}

/* ---------- Headers e fetch defensivo com failover ---------- */

function getHeaders(token: string, isPost = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, text/plain, */*",
    "User-Agent": "okhttp/4.11.0",
    "request-time": String(Date.now()),
  };
  if (isPost) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function tomatoRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    preferredBase?: string;
  } = {},
): Promise<T> {
  const bases = options.preferredBase
    ? [options.preferredBase, ...BASES.filter((b) => b !== options.preferredBase)]
    : BASES;

  let lastError: Error | null = null;
  const isPost = options.method === "POST";

  for (const base of bases) {
    try {
      const url = `${base}/${endpoint.replace(/^\/+/, "")}`;
      const res = await fetch(url, {
        method: options.method || "GET",
        headers: getHeaders(TOMATO_TOKEN, isPost),
        body: isPost && options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(9_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} em ${url}`);
      }

      const json = await res.json();
      return json as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("Tomato API indisponível");
}

/* ---------- Normalização e cálculo de similaridade ---------- */

export function cleanTitle(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\[\(][^\]\)]*[\]\)]/g, " ")
    .replace(/\b(dublado|legendado|dub|sub|pt-?br|season|temporada|part|parte)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calcMatchScore(query: string, candidate: string): number {
  const qClean = cleanTitle(query);
  const cClean = cleanTitle(candidate);
  if (!qClean || !cClean) return 0;
  if (qClean === cClean) return 100;
  if (cClean.includes(qClean) || qClean.includes(cClean)) return 92;

  const qTokens = new Set(qClean.split(" ").filter((t) => t.length > 1));
  const cTokens = new Set(cClean.split(" ").filter((t) => t.length > 1));
  if (qTokens.size === 0 || cTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of qTokens) {
    if (cTokens.has(token)) intersection++;
  }

  const score = Math.round((intersection / Math.max(qTokens.size, cTokens.size)) * 100);
  return score;
}

/* ---------- Métodos da API ---------- */

interface RawSearchResponse {
  status: boolean;
  result?: TomatoSearchItem[];
  data?: TomatoSearchItem[];
}

export async function searchTomato(query: string): Promise<TomatoSearchItem[]> {
  const q = query.trim();
  if (!q) return [];

  return await cached(`tomato:search:${cleanTitle(q)}`, 30 * 60_000, async () => {
    try {
      const resp = await tomatoRequest<RawSearchResponse>("/v2/content/search", {
        method: "POST",
        body: {
          token: TOMATO_TOKEN,
          search: q,
          content_type: "anime",
          page: 0,
        },
      });

      return resp.result || resp.data || [];
    } catch {
      return [];
    }
  });
}

interface RawAnimeDetailResponse {
  status: boolean;
  anime_details?: TomatoAnimeDetails;
  anime_seasons?: TomatoSeason[];
  data?: {
    anime_details?: TomatoAnimeDetails;
    anime_seasons?: TomatoSeason[];
  };
}

export async function getTomatoAnime(animeId: number): Promise<TomatoAnimeFull | null> {
  if (!Number.isFinite(animeId) || animeId <= 0) return null;

  return await cached(`tomato:anime:${animeId}`, 60 * 60_000, async () => {
    try {
      const resp = await tomatoRequest<RawAnimeDetailResponse>(`/v2/anime/${animeId}`);
      const details = resp.anime_details || resp.data?.anime_details;
      const seasons = resp.anime_seasons || resp.data?.anime_seasons || [];

      if (!details) return null;
      return {
        anime_details: details,
        anime_seasons: seasons,
      };
    } catch {
      return null;
    }
  });
}

interface RawEpisodesResponse {
  status: boolean;
  episodes?: number;
  data?: TomatoEpisodeItem[];
}

export async function getTomatoSeasonEpisodes(
  seasonId: number,
  page = 0,
): Promise<TomatoEpisodeItem[]> {
  if (!Number.isFinite(seasonId) || seasonId <= 0) return [];

  return await cached(`tomato:season:${seasonId}:p${page}`, 60 * 60_000, async () => {
    try {
      const resp = await tomatoRequest<RawEpisodesResponse>(`/season/${seasonId}/episodes`, {
        method: "POST",
        body: {
          token: TOMATO_TOKEN,
          page,
          order: "ASC",
        },
      });

      return resp.data || [];
    } catch {
      return [];
    }
  });
}

interface RawStreamResponse {
  streams?: {
    fhd?: string | null;
    hd?: string | null;
    mhd?: string | null;
    shd?: string | null;
    sd?: string | null;
    [k: string]: string | null | undefined;
  };
  episodeNumber?: number;
  episodeName?: string;
  nextEpisodeID?: number;
}

export async function getTomatoEpisodeStream(
  episodeId: number,
): Promise<{ sources: TomatoPlayerSource[]; episodeNumber?: number; episodeTitle?: string } | null> {
  if (!Number.isFinite(episodeId) || episodeId <= 0) return null;

  // Cache curto (15 min) para renovar URLs assinadas antes que expirem (~100 min)
  return await cached(`tomato:stream:${episodeId}`, 15 * 60_000, async () => {
    try {
      const resp = await tomatoRequest<RawStreamResponse>(
        `/v2/anime/episode/${episodeId}/stream`,
      );

      const streams = resp.streams;
      if (!streams) return null;

      const sources: TomatoPlayerSource[] = [];
      const order = [
        { key: "fhd", label: "Tomato FHD 1080p" },
        { key: "hd", label: "Tomato HD 1080p" },
        { key: "mhd", label: "Tomato HD 720p" },
        { key: "shd", label: "Tomato SD 480p" },
        { key: "sd", label: "Tomato SD 480p" },
      ];

      for (const item of order) {
        const streamUrl = streams[item.key];
        if (streamUrl && typeof streamUrl === "string" && streamUrl.trim()) {
          const trimmed = streamUrl.trim();
          if (!sources.some((s) => s.playUrl === trimmed)) {
            sources.push({
              label: item.label,
              provider: "Tomato",
              playUrl: trimmed,
              direct: true,
            });
          }
        }
      }

      return {
        sources,
        episodeNumber: resp.episodeNumber,
        episodeTitle: resp.episodeName,
      };
    } catch {
      return null;
    }
  });
}

/* ---------- Matching com AniList/OtakuVerse ---------- */

export async function matchTomatoAnime(
  title: string,
  audioPref?: "dub" | "leg" | null,
): Promise<TomatoMatchItem[]> {
  const query = title.trim();
  if (!query) return [];

  return await cached(
    `tomato:matchall:${cleanTitle(query)}:${audioPref || "any"}`,
    2 * 3600_000,
    async () => {
      // 1. Busca pelo título completo
      let results = await searchTomato(query);

      // Se não encontrou, tenta com o título limpo (sem sufixos/temporada)
      if (results.length === 0) {
        const clean = cleanTitle(query);
        if (clean && clean !== query.toLowerCase()) {
          results = await searchTomato(clean);
        }
      }

      if (results.length === 0) return [];

      // 2. Pontua e ordena candidatos
      const scored = results
        .map((item) => {
          const score = calcMatchScore(query, item.name);
          return { item, score };
        })
        .filter((entry) => entry.score >= 50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3); // Top 3 candidatos mais próximos

      // 3. Carrega os detalhes e temporadas para enriquecer
      const matches: TomatoMatchItem[] = [];

      for (const { item, score } of scored) {
        const detail = await getTomatoAnime(item.id);
        const seasons = detail?.anime_seasons || [];

        // Mapeia temporadas
        const mappedSeasons = seasons.map((s) => ({
          id: s.season_id,
          name: s.season_name,
          number: s.season_number,
          dubbed: s.season_dubbed === 1,
          episodesCount: s.season_episodes,
        }));

        // Se o usuário tem preferência de áudio, reordena as temporadas compatíveis primeiro
        if (audioPref) {
          const wantDub = audioPref === "dub";
          mappedSeasons.sort((a, b) => {
            if (a.dubbed === wantDub && b.dubbed !== wantDub) return -1;
            if (b.dubbed === wantDub && a.dubbed !== wantDub) return 1;
            return a.number - b.number;
          });
        }

        matches.push({
          id: item.id,
          name: item.name,
          year: item.date ? Number.parseInt(item.date, 10) || null : null,
          coverUrl: item.image || null,
          episodeCount: item.episodes || 0,
          score,
          seasons: mappedSeasons,
        });
      }

      return matches;
    },
  );
}

/* ---------- Resolução completa de episódio para reprodução ---------- */

export async function resolveTomatoEpisodeStream(params: {
  animeId: number;
  seasonNumber?: number;
  episodeNumber: number;
  audioPref?: "dub" | "leg" | null;
}): Promise<TomatoStreamResult | null> {
  const { animeId, episodeNumber } = params;
  const seasonNum = params.seasonNumber && params.seasonNumber > 0 ? params.seasonNumber : 1;
  const wantDub = params.audioPref === "dub";

  const anime = await getTomatoAnime(animeId);
  if (!anime || !anime.anime_seasons.length) return null;

  // 1. Procura a temporada pelo número e áudio desejado
  let chosenSeason = anime.anime_seasons.find(
    (s) => s.season_number === seasonNum && (s.season_dubbed === 1) === wantDub,
  );

  // Se não achar a dublagem específica, usa a temporada disponível
  if (!chosenSeason) {
    chosenSeason =
      anime.anime_seasons.find((s) => s.season_number === seasonNum) ||
      anime.anime_seasons[0];
  }

  if (!chosenSeason) return null;

  // 2. Procura o episódio dentro da temporada
  // Cada página tem até 25 episódios
  const targetPage = Math.max(0, Math.floor((episodeNumber - 1) / 25));
  let episodes = await getTomatoSeasonEpisodes(chosenSeason.season_id, targetPage);

  let targetEp = episodes.find((e) => e.ep_number === episodeNumber);

  // Fallback para página 0 se estiver em outra página e não encontrar
  if (!targetEp && targetPage !== 0) {
    episodes = await getTomatoSeasonEpisodes(chosenSeason.season_id, 0);
    targetEp = episodes.find((e) => e.ep_number === episodeNumber);
  }

  // Se ainda não achar, pega o primeiro episódio ou o correspondente ao índice
  if (!targetEp && episodes.length > 0) {
    targetEp =
      episodes.find((e) => Math.abs(e.ep_number - episodeNumber) <= 1) ||
      episodes[0];
  }

  if (!targetEp) return null;

  // 3. Resolve os streams do episódio
  const streamInfo = await getTomatoEpisodeStream(targetEp.ep_id);
  if (!streamInfo || streamInfo.sources.length === 0) return null;

  return {
    animeId,
    seasonId: chosenSeason.season_id,
    episodeId: targetEp.ep_id,
    episodeNumber: targetEp.ep_number,
    episodeTitle: targetEp.ep_name || streamInfo.episodeTitle,
    isDubbed: chosenSeason.season_dubbed === 1,
    sources: streamInfo.sources,
  };
}
