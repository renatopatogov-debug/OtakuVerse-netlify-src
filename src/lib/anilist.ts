// Cliente server-side da API GraphQL do AniList (graphql.anilist.co).
// Usada para: trending da temporada, notas em lote e enriquecimento de detalhes
// (incluindo idMal, que alimenta o AniSkip e o ani.zip).
// Rate limit público ~90 req/min — mitigado com cache server-side (lib/cache).

const API = "https://graphql.anilist.co";

export interface AniListMedia {
  id: number;
  idMal: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  averageScore: number | null;
  genres: string[];
  bannerImage: string | null;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  description: string | null;
  trailer: { id: string; site: string; thumbnail: string | null } | null;
  episodes: number | null;
  format: string | null;
  status: string | null;
  seasonYear: number | null;
  siteUrl: string | null;
}

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  averageScore
  genres
  bannerImage
  coverImage { extraLarge large }
  description(asHtml: false)
  trailer { id site thumbnail }
  episodes
  format
  status
  seasonYear
  siteUrl
`;

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors?.length) {
        throw new Error(json.errors[0]?.message ?? "Erro GraphQL AniList");
      }
      return json.data as T;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/* ---------- Utilidades de título ---------- */

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const A = normalizeTitle(a);
  const B = normalizeTitle(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const bg = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const ga = bg(A);
  const gb = bg(B);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

/** Melhor match entre o resultado do AniList e o título pedido. */
function bestMatch(
  media: AniListMedia,
  wanted: string,
): number {
  const cands = [
    media.title.romaji,
    media.title.english,
    media.title.native,
  ].filter(Boolean) as string[];
  if (cands.length === 0) return 0;
  return Math.max(...cands.map((c) => similarity(c, wanted)));
}

/* ---------- Trending ---------- */

export async function fetchTrending(perPage = 8): Promise<AniListMedia[]> {
  const data = await gql<{ Page: { media: AniListMedia[] } }>(
    `query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }`,
    { perPage },
  );
  return data.Page.media ?? [];
}

/* ---------- Notas em lote (aliases) ---------- */

export async function fetchScores(
  titles: string[],
): Promise<(number | null)[]> {
  const list = titles.slice(0, 24);
  if (list.length === 0) return [];
  const varDefs = list.map((_, i) => `$q${i}: String`).join(", ");
  const aliases = list
    .map(
      (_, i) =>
        `m${i}: Media(search: $q${i}, type: ANIME, isAdult: false) { averageScore }`,
    )
    .join("\n    ");
  const vars: Record<string, unknown> = {};
  list.forEach((t, i) => {
    vars[`q${i}`] = t;
  });
  const data = await gql<Record<string, { averageScore: number | null } | null>>(
    `query (${varDefs}) {
      ${aliases}
    }`,
    vars,
  );
  return list.map((_, i) => data[`m${i}`]?.averageScore ?? null);
}

/* ---------- Enriquecimento por título ---------- */

/**
 * Busca um anime no AniList tentando primeiro o nome em inglês/romaji
 * (nameEn) e depois o nome local. Valida o match por similaridade para
 * evitar casar com títulos errados. Uma única request GraphQL com aliases.
 */
export async function enrichAnime(
  name: string,
  nameEn?: string | null,
): Promise<AniListMedia | null> {
  const queries = [
    ...new Set(
      [nameEn?.trim(), name.trim()].filter((t): t is string => !!t),
    ),
  ].slice(0, 2);
  if (queries.length === 0) return null;

  const varDefs = queries.map((_, i) => `$q${i}: String`).join(", ");
  const aliases = queries
    .map(
      (_, i) =>
        `m${i}: Media(search: $q${i}, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} }`,
    )
    .join("\n    ");
  const vars: Record<string, unknown> = {};
  queries.forEach((t, i) => {
    vars[`q${i}`] = t;
  });

  try {
    const data = await gql<Record<string, AniListMedia | null>>(
      `query (${varDefs}) {
        ${aliases}
      }`,
      vars,
    );

    let best: AniListMedia | null = null;
    let bestScore = 0;
    queries.forEach((wanted, i) => {
      const m = data[`m${i}`];
      if (!m) return;
      const score = bestMatch(m, wanted) + (i === 0 ? 0.05 : 0); // leve bônus pro nameEn
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    });

    if (best && bestScore >= 0.35) {
      return {
        ...(best as AniListMedia),
        description: cleanDescription((best as AniListMedia).description),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Busca um MANGÁ no AniList pelo título (usado como fonte de metadados
 * alternativa ao MangaDex — descrições geralmente mais completas).
 * Valida por similaridade como o enrichAnime. Retorna null em qualquer falha.
 */
export async function enrichManga(name: string): Promise<AniListMedia | null> {
  const wanted = name.trim();
  if (!wanted) return null;
  try {
    const data = await gql<{ Media: AniListMedia | null }>(
      `query ($q: String) {
        Media(search: $q, type: MANGA, isAdult: false) { ${MEDIA_FIELDS} }
      }`,
      { q: wanted },
    );
    const m = data.Media;
    if (!m || bestMatch(m, wanted) < 0.3) return null;
    return { ...m, description: cleanDescription(m.description) };
  } catch {
    return null;
  }
}

export function cleanDescription(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ---------- Recomendações ---------- */

/**
 * Recomendações de anime via AniList: busca o Media pelo título e traz as
 * mediaRecommendation (votadas pela comunidade, ordenadas por rating).
 * Falha silenciosa ([]) — recomendação nunca deve quebrar a página.
 */
export async function fetchAnimeRecs(
  name: string,
  nameEn?: string | null,
): Promise<AniListMedia[]> {
  const q = (nameEn?.trim() || name.trim());
  if (!q) return [];
  try {
    const data = await gql<{
      Media: {
        recommendations: {
          nodes: { mediaRecommendation: AniListMedia | null }[];
        };
      } | null;
    }>(
      `query ($q: String) {
        Media(search: $q, type: ANIME, isAdult: false) {
          recommendations(perPage: 12, sort: RATING_DESC) {
            nodes {
              mediaRecommendation {
                ${MEDIA_FIELDS}
              }
            }
          }
        }
      }`,
      { q },
    );
    const seen = new Set<number>();
    const out: AniListMedia[] = [];
    for (const r of data.Media?.recommendations.nodes ?? []) {
      const m = r.mediaRecommendation;
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ ...m, description: cleanDescription(m.description) });
    }
    return out.slice(0, 10);
  } catch {
    return [];
  }
}

/**
 * Obras relacionadas a um mangá no AniList (sequências, spin-offs,
 * adaptações, etc.). Retorna os títulos normalizados + tipo de relação,
 * para o chamador resolver cada título na fonte real (MangaDex).
 */
export async function fetchMangaRelationTitles(
  name: string,
): Promise<{ title: string; relation: string; isManga: boolean }[]> {
  const wanted = name.trim();
  if (!wanted) return [];
  try {
    const data = await gql<{
      Media: {
        relations: {
          edges: {
            relationType: string | null;
            node: {
              type: string;
              title: { romaji: string | null; english: string | null };
            } | null;
          }[];
        } | null;
      } | null;
    }>(
      `query ($q: String) {
        Media(search: $q, type: MANGA, isAdult: false) {
          relations {
            edges {
              relationType
              node {
                type
                title { romaji english }
              }
            }
          }
        }
      }`,
      { q: wanted },
    );
    const wantedN = normalizeTitle(wanted);
    return (data.Media?.relations?.edges ?? [])
      .map((e) => {
        const node = e.node;
        if (!node || node.type !== "MANGA") return null;
        const title = node.title.english ?? node.title.romaji;
        if (!title) return null;
        return { title, relation: e.relationType ?? "RELATED", isManga: true };
      })
      .filter(
        (x): x is { title: string; relation: string; isManga: boolean } =>
          !!x && normalizeTitle(x.title) !== wantedN,
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}
