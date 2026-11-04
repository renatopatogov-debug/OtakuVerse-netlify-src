// Cliente server-side da API pública do MangaDex (https://api.mangadex.org).
// Documentação: https://api.mangadex.org/docs/

import { fetchMangaRelationTitles } from "@/lib/anilist";

const API = "https://api.mangadex.org";
const UPLOADS = "https://uploads.mangadex.org";

/** Ordem de preferência de idiomas para exibição dos capítulos. */
export const LANG_PRIORITY = ["pt-br", "en", "es-la", "es"];

/* ---------- Tipos ---------- */

export interface MangaItem {
  id: string;
  title: string;
  altTitlePtBr?: string | null;
  description?: string | null;
  year?: number | null;
  status?: string | null;
  contentRating?: string | null;
  tags: string[];
  coverUrl: string | null;
  originalLanguage?: string | null;
  followedCount?: number | null;
  lastChapter?: string | null;
}

export interface ChapterItem {
  id: string;
  chapter: string | null;
  title: string | null;
  lang: string;
  pages: number;
  group?: string | null;
  publishAt: string;
  externalUrl?: string | null;
}

export interface MangaDetailResult {
  manga: MangaItem;
  author?: string | null;
  chapters: ChapterItem[];
  /** Fonte real dos capítulos (definido pela route detail): "mangadex" | "kakamanga". */
  source?: string;
  /** Total de capítulos por idioma (todos os langs) — a UI busca por idioma sob demanda. */
  langTotals?: Record<string, number>;
  /** Idioma cujos capítulos já vêm carregados no campo "chapters". */
  loadedLang?: string;
}

export interface ChapterPages {
  chapterId: string;
  pages: string[];
  total: number;
}

/* ---------- Helpers ---------- */

interface RawManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles: Record<string, string>[];
    description: Record<string, string>;
    year: number | null;
    status: string | null;
    contentRating: string | null;
    originalLanguage: string | null;
    lastChapter: string | null;
    tags: { attributes: { name: Record<string, string> } }[];
  };
  relationships: { id: string; type: string; attributes?: { fileName?: string } }[];
}

function pickTitle(manga: RawManga): string {
  const attrs = manga.attributes;
  const pt = attrs.altTitles.find((t) => t["pt-br"])?.["pt-br"];
  const en = attrs.title.en ?? attrs.altTitles.find((t) => t.en)?.en;
  const any =
    Object.values(attrs.title).find(Boolean) ??
    attrs.altTitles.map((t) => Object.values(t).find(Boolean)).find(Boolean);
  return pt ?? en ?? any ?? "Sem título";
}

function pickDescription(manga: RawManga): string | null {
  const d = manga.attributes.description;
  return d["pt-br"] ?? d.en ?? null;
}

/**
 * Reescreve uma URL de imagem do MangaDex para passar pelo nosso proxy
 * (/api/img). Motivo: uploads.mangadex.org e os nós do at-home server podem
 * estar bloqueados/indisponíveis na rede do usuário final; via same-origin o
 * navegador nunca acessa o MangaDex diretamente.
 */
function proxied(url: string): string {
  // v=2: cache-busting. O proxy já serviu essas URLs com Cache-Control
  // immutable e o SW guarda em cache — se o conteúdo upstream já foi
  // corrompido/placeholder em algum momento, o parâmetro força refetch.
  return `/api/img?u=${encodeURIComponent(url)}&v=2`;
}

function coverUrl(manga: RawManga, size: "256" | "512"): string | null {
  const cover = manga.relationships?.find(
    (r) => r.type === "cover_art" && r.attributes?.fileName,
  );
  if (!cover?.attributes?.fileName) return null;
  return `/api/manga/cover/${manga.id}/${cover.attributes.fileName}.${size}.jpg`;
}

function toMangaItem(manga: RawManga, size: "256" | "512" = "256"): MangaItem {
  return {
    id: manga.id,
    title: pickTitle(manga),
    altTitlePtBr:
      manga.attributes.altTitles.find((t) => t["pt-br"])?.["pt-br"] ?? null,
    description: pickDescription(manga),
    year: manga.attributes.year,
    status: manga.attributes.status,
    contentRating: manga.attributes.contentRating,
    tags: manga.attributes.tags
      .map((t) => t.attributes.name.en ?? Object.values(t.attributes.name)[0])
      .filter(Boolean)
      .slice(0, 8),
    coverUrl: coverUrl(manga, size),
    originalLanguage: manga.attributes.originalLanguage,
    lastChapter: manga.attributes.lastChapter,
  };
}

async function mdFetch<T>(path: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${API}${path}?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": "OtakuVerseDemo/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MangaDex HTTP ${res.status}`);
  return (await res.json()) as T;
}

const COMMON_FILTERS = {
  "includes[]": "cover_art",
  "contentRating[]": ["safe", "suggestive"],
  hasAvailableChapters: "true",
};

function buildListParams(
  extra: Record<string, string | string[]>,
): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(COMMON_FILTERS)) {
    if (Array.isArray(v)) v.forEach((item) => p.append(k, item));
    else p.append(k, v);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (Array.isArray(v)) v.forEach((item) => p.append(k, item));
    else p.append(k, v);
  }
  return p;
}

interface MdListResponse {
  total: number;
  data: RawManga[];
}

/* ---------- Endpoints ---------- */

export async function searchMangas(
  q: string,
  offset: number,
  limit: number,
): Promise<{ total: number; items: MangaItem[] }> {
  const p = buildListParams({
    title: q,
    limit: String(Math.min(limit, 32)),
    offset: String(offset),
    "order[relevance]": "desc",
  });
  const json = await mdFetch<MdListResponse>("/manga", p);
  return { total: json.total, items: json.data.map((m) => toMangaItem(m)) };
}

export async function popularMangas(
  offset: number,
  limit: number,
): Promise<{ total: number; items: MangaItem[] }> {
  const p = buildListParams({
    limit: String(Math.min(limit, 32)),
    offset: String(offset),
    "order[followedCount]": "desc",
  });
  const json = await mdFetch<MdListResponse>("/manga", p);
  return { total: json.total, items: json.data.map((m) => toMangaItem(m)) };
}

export async function latestMangas(
  offset: number,
  limit: number,
): Promise<{ total: number; items: MangaItem[] }> {
  const p = buildListParams({
    limit: String(Math.min(limit, 32)),
    offset: String(offset),
    "order[latestUploadedChapter]": "desc",
  });
  const json = await mdFetch<MdListResponse>("/manga", p);
  return { total: json.total, items: json.data.map((m) => toMangaItem(m)) };
}

/**
 * Contagem de capítulos por idioma (limit=1, só o total). Rápido — 1 request
 * por idioma em paralelo. Usado pela UI pra saber quais abas existem sem ter
 * que baixar todas as listas de capítulos.
 */
export async function langTotals(
  id: string,
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    LANG_PRIORITY.map(async (lang): Promise<[string, number]> => {
      const p = new URLSearchParams({ limit: "1" });
      p.append("translatedLanguage[]", lang);
      for (const cr of ["safe", "suggestive"])
        p.append("contentRating[]", cr);
      p.append("includeExternalUrl", "0");
      try {
        const json = await mdFetch<{ total: number }>(
          `/manga/${id}/feed`,
          p,
        );
        return [lang, json.total];
      } catch {
        return [lang, 0];
      }
    }),
  );
  return Object.fromEntries(entries);
}

function feedParams(lang: string): URLSearchParams {
  const p = new URLSearchParams({ limit: "500", "order[chapter]": "desc" });
  p.append("translatedLanguage[]", lang);
  for (const cr of ["safe", "suggestive"]) p.append("contentRating[]", cr);
  p.append("includeExternalUrl", "0");
  p.append("includes[]", "scanlation_group");
  return p;
}

/** Capítulos de UM idioma selecionado (rápido em 1 chamada única de até 500 caps). */
export async function chaptersForLang(
  id: string,
  lang: string,
): Promise<{ chapters: ChapterItem[]; total: number }> {
  type FeedItem = {
    id: string;
    attributes: {
      chapter: string | null;
      title: string | null;
      translatedLanguage: string;
      pages: number;
      publishAt: string;
      externalUrl: string | null;
    };
    relationships: { id: string; type: string; attributes?: { name?: string } }[];
  };
  const p = feedParams(lang);
  p.set("limit", "500");
  p.set("offset", "0");
  const feed = await mdFetch<{ total: number; data: FeedItem[] }>(
    `/manga/${id}/feed`,
    p,
  );

  const chapters: ChapterItem[] = (feed.data ?? []).map((c) => ({
    id: c.id,
    chapter: c.attributes.chapter,
    title: c.attributes.title,
    lang: c.attributes.translatedLanguage,
    pages: c.attributes.pages,
    group:
      c.relationships.find((r) => r.type === "scanlation_group")?.attributes
        ?.name ?? null,
    publishAt: c.attributes.publishAt,
  }));
  return { chapters, total: feed.total };
}

/**
 * Detalhe do mangá + capítulos do idioma selecionado.
 * Busca APENAS o idioma requisitado para responder instantaneamente e não sobrecarregar a API.
 */
export async function mangaDetail(
  id: string,
  preferredLang?: string | null,
): Promise<MangaDetailResult> {
  const pManga = new URLSearchParams();
  for (const inc of ["cover_art", "author", "artist"]) pManga.append("includes[]", inc);
  const json = await mdFetch<{ data: RawManga }>("/manga/" + id, pManga);
  const manga = toMangaItem(json.data, "512");

  const authorRel = json.data.relationships?.find((r) => r.type === "author");
  const authorName = (
    authorRel?.attributes as { name?: string } | undefined
  )?.name;

  const targetLang = preferredLang?.trim() || "pt-br";
  let chapters: ChapterItem[] = [];
  let total = 0;
  let loadedLang = targetLang;

  try {
    const res = await chaptersForLang(id, targetLang);
    chapters = res.chapters;
    total = res.total;
  } catch {
    chapters = [];
    total = 0;
  }

  // Fallback se pt-br não tiver capítulos
  if (chapters.length === 0 && targetLang === "pt-br") {
    try {
      const enRes = await chaptersForLang(id, "en");
      if (enRes.chapters.length > 0) {
        chapters = enRes.chapters;
        total = enRes.total;
        loadedLang = "en";
      }
    } catch {}
  }

  return {
    manga,
    author: authorName ?? null,
    chapters,
    langTotals: { [loadedLang]: total },
    loadedLang,
  };
}

export async function chapterPages(chapterId: string): Promise<ChapterPages> {
  const res = await fetch(`${API}/at-home/server/${chapterId}`, {
    headers: { Accept: "application/json", "User-Agent": "OtakuVerseDemo/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MangaDex HTTP ${res.status}`);
  const json = (await res.json()) as {
    baseUrl: string;
    chapter: { hash: string; data: string[] };
  };
  const { baseUrl, chapter } = json;
  const pages = (chapter.data ?? []).map(
    (img) =>
      `/api/manga/page/${chapter.hash}/${img}?b=${encodeURIComponent(baseUrl)}`,
  );
  return { chapterId, pages, total: pages.length };
}

/**
 * Recomendações de mangá. O MangaDex não tem endpoint de relações/recomendações,
 * então a cadeia é: (1) título do mangá; (2) obras relacionadas no AniList
 * (sequências, spin-offs, adaptações); (3) cada título relacionado resolvido
 * de volta no MangaDex via busca (melhor match de relevância).
 */
export async function mangaRecommendations(
  id: string,
): Promise<MangaItem[]> {
  // 1. Título do próprio mangá (fetch leve, só o self).
  let candidates: string[] = [];
  let selfTitle: string;
  try {
    const pSelf = new URLSearchParams({ "includes[]": "cover_art" });
    const self = await mdFetch<{ data: RawManga }>(`/manga/${id}`, pSelf);
    selfTitle = pickTitle(self.data);
    // O título exibido (pt-br) pode não existir no AniList — tentamos
    // todos os candidatos: pt-br, en, romaji, nativo.
    candidates = [
      self.data.attributes.title.en,
      self.data.attributes.title["ja-ro"],
      self.data.attributes.title.ja,
      self.data.attributes.title.ko,
      self.data.attributes.title.zh,
      ...self.data.attributes.altTitles.map((t) => t.en),
    ]
      .filter((t): t is string => !!t)
      .slice(0, 4);
  } catch {
    return [];
  }

  // 2. Relacionadas no AniList (tenta candidatos até achar um Media com relações).
  let related: Awaited<ReturnType<typeof fetchMangaRelationTitles>> = [];
  for (const cand of candidates) {
    related = await fetchMangaRelationTitles(cand);
    if (related.length > 0) break;
  }
  if (related.length === 0) return [];

  // 3. Resolve cada título no MangaDex (busca de relevância, 1º resultado).
  const seenIds = new Set<string>([id]);
  const seenTitles = new Set<string>([selfTitle.toLowerCase()]);
  const out: MangaItem[] = [];
  for (const rel of related) {
    if (out.length >= 10) break;
    try {
      const r = await searchMangas(rel.title, 0, 1);
      const hit = r.items[0];
      if (
        hit &&
        !seenIds.has(hit.id) &&
        !seenTitles.has(hit.title.toLowerCase())
      ) {
        seenIds.add(hit.id);
        seenTitles.add(hit.title.toLowerCase());
        out.push(hit);
      }
    } catch {
      // Título sem match no MangaDex — segue pro próximo.
    }
  }
  return out;
}
