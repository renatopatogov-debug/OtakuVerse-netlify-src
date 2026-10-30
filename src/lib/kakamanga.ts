// Cliente server-side do KakaManga (www.kakamanga.com) — rede Mangakakalot.
//
// Papel no OtakuVerse: FONTE SECUNDÁRIA de mangá. O MangaDex continua sendo a
// busca/catálogo; o KakaManga entra como fallback de capítulos quando o
// MangaDex não tem (ex.: Sousou no Frieren, cuja fonte oficial saiu do ar).
//
// Endpoints descobertos por captura de tráfego:
//   GET /api/manga/{slug}/chapters?limit=-1  → JSON limpo, sem assinatura
//   GET /manga/{slug}/{chapterSlug}          → HTML com <img> das páginas
//   Imagens: https://img{r,s}-N.2xstorage.com/{slug}/{cap}/{n}.webp
//
// Observação: a busca deles (/search/story/) é bloqueada por Cloudflare para
// IPs de datacenter, por isso a descoberta aqui é feita por slugify do título
// vindo do MangaDex (prova do /manga/{slug} → 200 = existe).

import type { ChapterItem } from "@/lib/mangadex";

const BASE = "https://www.kakamanga.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Prefixo usado no id dos capítulos vindos desta fonte: `kaka__{slug}__{chapterSlug}`. */
export const KAKA_PREFIX = "kaka__";

export function isKakaChapterId(id: string): boolean {
  return id.startsWith(KAKA_PREFIX);
}

/** Separa `kaka__{slug}__{chapterSlug}` (slugs não contêm "__"). */
export function parseKakaChapterId(
  id: string,
): { slug: string; chapterSlug: string } | null {
  if (!isKakaChapterId(id)) return null;
  const rest = id.slice(KAKA_PREFIX.length);
  const sep = rest.indexOf("__");
  if (sep <= 0) return null;
  const slug = rest.slice(0, sep);
  const chapterSlug = rest.slice(sep + 2);
  if (!slug || !chapterSlug) return null;
  return { slug, chapterSlug };
}

/* ---------- Helpers ---------- */

async function kakaFetch(url: string, timeout = 15_000): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
}

/** Converte um título em slug no padrão do site: minúsculas, traços, ascii. */
export function slugifyTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Prova se um slug existe no KakaManga. Tenta o slug direto e algumas
 * variações comuns (artigos finais, sufixos de edição). Retorna o primeiro
 * slug que responde 200 com página de detalhe válida.
 */
export async function findKakaSlug(title: string): Promise<string | null> {
  const base = slugifyTitle(title);
  if (!base) return null;

  // Variações: direto, sem sufixo numérico duplicado, etc.
  const candidates = [base];
  // Títulos com subtítulo separado por ":" viram "-" no slug — já coberto.
  // Algumas séries têm slug truncado ou com "(official)" removido:
  candidates.push(base.replace(/-official$/, ""));

  for (const slug of [...new Set(candidates)]) {
    try {
      const res = await kakaFetch(`${BASE}/manga/${slug}`, 10_000);
      if (res.ok) {
        const html = await res.text();
        // Confirma que é a página do mangá (não 404 soft com 200)
        if (html.includes("window.chapter_data") || html.includes("/api/manga/")) {
          return slug;
        }
      }
    } catch {
      // timeout/rede → tenta próximo candidato
    }
  }
  return null;
}

interface KakaChapterRaw {
  chapter_name: string;
  chapter_slug: string;
  chapter_num: number | null;
  updated_at: string;
  view: number;
}

/**
 * Lista de capítulos de um slug, no mesmo formato ChapterItem do MangaDex
 * (lang fixo "en", pages 0 — o total real só aparece no viewer).
 * Ordenado cap desc (mesma convenção do feed do MangaDex antes da ordenação
 * por idioma).
 */
export async function kakaChapters(slug: string): Promise<ChapterItem[]> {
  const res = await kakaFetch(`${BASE}/api/manga/${slug}/chapters?limit=-1`);
  if (!res.ok) throw new Error(`KakaManga HTTP ${res.status}`);
  const json = (await res.json()) as {
    success: boolean;
    data?: { chapters?: KakaChapterRaw[] };
  };
  const list = json.data?.chapters ?? [];
  return list.map((c) => ({
    id: `${KAKA_PREFIX}${slug}__${c.chapter_slug}`,
    chapter: c.chapter_num != null ? String(c.chapter_num) : null,
    title: c.chapter_name !== `Chapter ${c.chapter_num}` ? c.chapter_name : null,
    lang: "en",
    pages: 0,
    group: "KakaManga",
    publishAt: c.updated_at,
  }));
}

/**
 * Extrai as URLs das páginas de um capítulo a partir do HTML do viewer.
 * O site injeta as <img> server-side com host img{r,s}-N.2xstorage.com;
 * dedup mantendo a ordem (os dois hosts são espelhos do mesmo conteúdo).
 */
export async function kakaPages(
  slug: string,
  chapterSlug: string,
): Promise<string[]> {
  const res = await kakaFetch(`${BASE}/manga/${slug}/${chapterSlug}`);
  if (!res.ok) throw new Error(`KakaManga HTTP ${res.status}`);
  const html = await res.text();

  const re =
    /https:\/\/imgs?-\d*\.2xstorage\.com\/([a-z0-9-]+)\/(\d+(?:\.\d+)?)\/(\d+)\.(webp|jpg|jpeg|png)/gi;
  const seen = new Set<string>();
  const pages: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    // Normaliza pro host img-r-1 (principal) e deduplica pelo caminho
    const path = `${m[1]}/${m[2]}/${m[3]}.${m[4] ?? "webp"}`;
    if (seen.has(path)) continue;
    seen.add(path);
    pages.push(`https://img-r1.2xstorage.com/${path}`);
  }
  // Ordena por número da página (o HTML pode intercalar espelhos)
  pages.sort((a, b) => {
    const na = Number(a.match(/\/(\d+)\.webp$/)?.[1] ?? 0);
    const nb = Number(b.match(/\/(\d+)\.webp$/)?.[1] ?? 0);
    return na - nb;
  });
  return pages;
}
