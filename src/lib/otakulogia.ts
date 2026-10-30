// Cliente server-side da API GraphQL do Otakulogia.
// IMPORTANTE: chamado apenas do servidor (sem header Origin),
// o que contorna o bloqueio de origin externo que a API aplica ao navegador.

const API = "https://api.otakulogia.com/graphql";

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors?.length) {
        throw new Error(json.errors[0]?.message ?? "Erro GraphQL");
      }
      return json.data as T;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/* ---------- Tipos ---------- */

export interface AnimeItem {
  id: string;
  upstreamCid: number;
  name: string;
  slug: string;
  nameEn?: string | null;
  year?: number | null;
  status?: string | null;
  synopsis?: string | null;
  posterUrl?: string | null;
  audioMix?: string | null;
  hasNewEpisode?: boolean | null;
}

export interface CategoryItem {
  id: string;
  kind: string;
  name: string;
  slug: string;
  animeCount: number;
}

export interface SeasonInfo {
  id: string;
  upstreamTid: number;
  name: string;
  slug: string;
  imageUrl?: string | null;
  audioType?: string | null;
  year?: number | null;
  status?: string | null;
  synopsis?: string | null;
}

export interface EpisodeInfo {
  id: string;
  upstreamId?: number | null;
  title?: string | null;
  slug?: string | null;
  episodeNumber?: number | null;
  upstreamTempId?: number | null;
  description?: string | null;
  videoUrl?: string | null;
  videoUrlFhd?: string | null;
  videoUrlSd?: string | null;
  thumbnailLarge?: string | null;
  thumbnailSmall?: string | null;
  videoType?: string | null;
  audioType?: string | null;
  isNew?: boolean | null;
}

export interface AnimeCatalogDetail {
  anime: AnimeItem;
  seasons: SeasonInfo[];
  episodes: EpisodeInfo[];
}

export interface ListResult<T> {
  total: number;
  items: T[];
}

/* ---------- Queries ---------- */

const ANIME_FIELDS = `
  id
  upstreamCid
  name
  slug
  nameEn
  year
  status
  synopsis
  posterUrl
  audioMix
  hasNewEpisode
`;

export async function fetchLatestReleases(
  offset: number,
  limit: number,
  audioType?: string | null,
): Promise<ListResult<AnimeItem>> {
  const input: Record<string, unknown> = { offset, limit };
  if (audioType) input.audioType = audioType;
  const data = await gql<{
    latestReleases: { total: number; items: AnimeItem[] };
  }>(
    `query Latest($input: LatestReleasesInput) {
      latestReleases(input: $input) { total items { ${ANIME_FIELDS} } }
    }`,
    { input },
  );
  return { total: data.latestReleases.total, items: data.latestReleases.items };
}

export async function fetchSearchAnimes(
  q: string,
  offset: number,
  limit: number,
): Promise<ListResult<AnimeItem>> {
  const data = await gql<{
    searchAnimes: { total: number; items: AnimeItem[] };
  }>(
    `query Search($query: String, $offset: Int, $limit: Int) {
      searchAnimes(input: { query: $query, offset: $offset, limit: $limit }) {
        total items { ${ANIME_FIELDS} }
      }
    }`,
    { query: q, offset, limit },
  );
  return { total: data.searchAnimes.total, items: data.searchAnimes.items };
}

export async function fetchCategories(): Promise<ListResult<CategoryItem>> {
  const data = await gql<{
    categories: { total: number; items: CategoryItem[] };
  }>(
    `query Cats($input: CategoriesInput) {
      categories(input: $input) { total items { id kind name slug animeCount } }
    }`,
    { input: { offset: 0, limit: 100 } },
  );
  return { total: data.categories.total, items: data.categories.items };
}

export async function fetchAnimesByCategory(
  categoryId: string,
  offset: number,
  limit: number,
  audioType?: string | null,
): Promise<ListResult<AnimeItem>> {
  const input: Record<string, unknown> = { categoryId, offset, limit };
  if (audioType) input.audioType = audioType;
  const data = await gql<{
    animesByCategory: { total: number; items: AnimeItem[] };
  }>(
    `query ByCat($input: AnimesByCategoryInput!) {
      animesByCategory(input: $input) { total items { ${ANIME_FIELDS} } }
    }`,
    { input },
  );
  return {
    total: data.animesByCategory.total,
    items: data.animesByCategory.items,
  };
}

export async function fetchAnimeDetail(
  upstreamCid: number,
  upstreamTid?: number | null,
): Promise<AnimeCatalogDetail> {
  const data = await gql<{ animeCatalogDetail: AnimeCatalogDetail }>(
    `query Detail($upstreamCid: Int!, $upstreamTid: Int) {
      animeCatalogDetail(upstreamCid: $upstreamCid, upstreamTid: $upstreamTid) {
        anime { ${ANIME_FIELDS} }
        seasons {
          id
          upstreamTid
          name
          slug
          imageUrl
          audioType
          year
          status
          synopsis
        }
        episodes {
          id
          upstreamId
          title
          slug
          episodeNumber
          upstreamTempId
          description
          videoUrl
          videoUrlFhd
          videoUrlSd
          thumbnailLarge
          thumbnailSmall
          videoType
          audioType
          isNew
        }
      }
    }`,
    { upstreamCid, upstreamTid: upstreamTid ?? null },
  );
  return data.animeCatalogDetail;
}
