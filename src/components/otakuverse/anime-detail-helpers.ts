import type { AniListMedia } from "@/lib/anilist";
import type { AniZipEpisode, AniZipMapping } from "@/lib/anizip";

/** Extrai o nº do episódio do título, priorizando padrões "EP. 04" e "Episódio 4". */
export function epNumFromTitle(title?: string | null): number | null {
  if (!title) return null;
  const patterns = [
    /EP\.?\s*(\d{1,4})/i,
    /Epis[óo]dio\s*(\d{1,4})/i,
    /#\s*(\d{1,4})/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

export interface EnrichResult {
  media: AniListMedia | null;
  anizip: AniZipMapping | null;
  titlePtBr: string | null;
}

export function zipEpisode(
  anizip: AniZipMapping | null,
  n: number | null,
): AniZipEpisode | null {
  if (!anizip?.episodes || !n) return null;
  return anizip.episodes[String(n)] ?? null;
}

export function zipTitlePtBr(
  anizip: AniZipMapping | null,
  n: number | null,
): string | null {
  const info = zipEpisode(anizip, n);
  if (!info?.title) return null;
  return (
    info.title["pt-BR"] ??
    info.title["pt"] ??
    info.title["en"] ??
    info.title["x-jat"] ??
    null
  );
}

export interface SfhdMatchItem {
  seriesId: string;
  title: string;
  coverUrl: string | null;
  episodeCount: number;
  category: string | null;
}
