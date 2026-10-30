// Cliente server-side do ani.zip — mapeamento gratuito de IDs entre bases
// (AniList, MAL, Kitsu, TVDB...) com títulos localizados, incluindo pt-BR,
// tanto do anime quanto dos episódios.
// Endpoint público: https://api.ani.zip/mappings?anilist_id={id}

export interface AniZipEpisode {
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
  seasonNumber?: number;
  title?: Record<string, string> | null;
  image?: string | null;
  airdate?: string | null;
  airDateUtc?: string | null;
  length?: number | null; // minutos
  rating?: number | null;
  summary?: string | null;
  anidbEid?: number | null;
}

export interface AniZipMapping {
  titles: Record<string, string>;
  mappings: Record<string, string | number | null>;
  episodeCount?: number;
  specialCount?: number;
  images?: Record<string, string | string[] | null>;
  episodes?: Record<string, AniZipEpisode>;
}

export async function fetchAniZipMapping(
  anilistId: number,
): Promise<AniZipMapping | null> {
  try {
    const res = await fetch(
      `https://api.ani.zip/mappings?anilist_id=${anilistId}`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as AniZipMapping & { statusCode?: number };
    if (!json || typeof json !== "object" || !json.titles) return null;
    return json;
  } catch {
    return null;
  }
}

/** Título do anime em pt-BR (fallback en → x-jat). */
export function ptBrTitle(mapping: AniZipMapping | null): string | null {
  if (!mapping?.titles) return null;
  return (
    mapping.titles["pt-BR"] ?? mapping.titles["pt"] ?? mapping.titles["en"] ??
    mapping.titles["x-jat"] ?? null
  );
}

/** Info do episódio (título pt-BR, imagem, duração, rating) por número. */
export function episodeInfo(
  mapping: AniZipMapping | null,
  epNumber: number,
): AniZipEpisode | null {
  const eps = mapping?.episodes;
  if (!eps) return null;
  const direct = eps[String(epNumber)];
  if (direct) return direct;
  // fallback: procura por número absoluto quando a chave não bate
  const found = Object.values(eps).find(
    (e) => e.absoluteEpisodeNumber === epNumber,
  );
  return found ?? null;
}

/** Título localizado do episódio, priorizando pt-BR. */
export function episodeTitlePtBr(
  mapping: AniZipMapping | null,
  epNumber: number,
): string | null {
  const info = episodeInfo(mapping, epNumber);
  if (!info?.title) return null;
  return info.title["pt-BR"] ?? info.title["pt"] ?? info.title["en"] ??
    info.title["x-jat"] ?? null;
}
