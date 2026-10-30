"use client";

// Downloads offline de capítulos de mangá.
//
// Estratégia: as páginas já chegam via proxy same-origin (/api/img), então
// dá pra guardar tudo na Cache API do navegador (cache "otv-downloads-v1")
// sem CORS e sem penalidade de quota de blob. Um manifesto sintético em
// /__otv/chapters/<chapterId>.json marca o capítulo como completo.
//
// O download é resumível: se cair no meio, o próximo toque só baixa as
// páginas que ainda faltam. Concorrência de 3 páginas por vez.

import { useCallback, useSyncExternalStore } from "react";

export const DL_CACHE = "otv-downloads-v1";
export const STORE_KEY = "otv:downloads:v1";
const PAGE_CONCURRENCY = 3;

/** Ordem de preferência de idiomas (espelha src/lib/mangadex.ts). */
const LANG_PRIORITY = ["pt-br", "en", "es-la", "es"];

/* ---------- Tipos ---------- */

export interface DownloadInput {
  chapterId: string;
  mangaId: string;
  mangaTitle: string;
  mangaCoverUrl: string | null;
  chapterNumber: string | null;
  label: string;
  lang: string;
}

export interface DownloadedChapter extends DownloadInput {
  pageCount: number;
  sizeBytes: number;
  downloadedAt: number;
}

export interface DownloadProgress {
  chapterId: string;
  done: number;
  total: number;
  /** true quando total ainda não é conhecido (buscando lista de páginas) */
  indeterminate?: boolean;
}

export interface DownloadState {
  entries: DownloadedChapter[];
  progress: Record<string, DownloadProgress>;
}

/* ---------- Store reativo (localStorage) ---------- */

type Listener = () => void;
let cache: DownloadState | null = null;
const listeners = new Set<Listener>();

function read(): DownloadState {
  if (cache !== null) return cache;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DownloadState) : null;
    cache = parsed && Array.isArray(parsed.entries)
      ? { entries: parsed.entries, progress: {} }
      : { entries: [], progress: {} };
  } catch {
    cache = { entries: [], progress: {} };
  }
  return cache;
}

function write(next: DownloadState) {
  cache = next;
  try {
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ entries: next.entries }),
    );
  } catch {
    // quota — segue em memória
  }
  for (const l of listeners) l();
}

function setProgress(p: DownloadProgress | null) {
  const cur = read();
  const progress = { ...cur.progress };
  if (p) {
    progress[p.chapterId] = p;
  } else {
    for (const k of Object.keys(progress)) delete progress[k];
  }
  write({ ...cur, progress });
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORE_KEY) {
      cache = null;
      for (const fn of listeners) fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: DownloadState = { entries: [], progress: {} };

export function useDownloads(): DownloadState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/* ---------- Helpers ---------- */

export function manifestKey(chapterId: string): string {
  return `/__otv/chapters/${chapterId}.json`;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function langWeight(l: string): number {
  const i = LANG_PRIORITY.indexOf(l);
  return i >= 0 ? i : LANG_PRIORITY.length;
}

/** Roda tarefas com concorrência limitada. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const item = items[idx++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/* ---------- API ---------- */

/**
 * Baixa todas as páginas do capítulo para a Cache API. Resumível: páginas
 * já presentes no cache são puladas. Grava o manifesto no final.
 */
export async function downloadChapter(
  input: DownloadInput,
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadedChapter> {
  const cache = await caches.open(DL_CACHE);
  setProgress({ chapterId: input.chapterId, done: 0, total: 0, indeterminate: true });
  onProgress?.({ chapterId: input.chapterId, done: 0, total: 0, indeterminate: true });

  try {
    // 1. Lista de páginas
    const res = await fetch(`/api/manga/pages?chapterId=${input.chapterId}`);
    if (!res.ok) throw new Error(`Falha ao listar páginas (HTTP ${res.status})`);
    const json = (await res.json()) as { pages: string[] };
    const pages = json.pages ?? [];
    if (pages.length === 0) throw new Error("Capítulo sem páginas");

    // 2. Baixa as que faltam (resumível), com relatórios de progresso
    let done = 0;
    let size = 0;
    const missing: { url: string; resp: Response }[] = [];
    for (const url of pages) {
      const hit = await cache.match(url);
      if (hit) {
        done++;
        size += Number(hit.headers.get("content-length") ?? 0);
      } else {
        missing.push({ url, resp: await fetch(url) });
      }
    }
    if (missing.some((m) => !m.resp.ok)) {
      throw new Error("Algumas páginas não responderam — tente de novo");
    }

    const toStore = missing;
    let stored = done;
    onProgress?.({ chapterId: input.chapterId, done: stored, total: pages.length });
    setProgress({ chapterId: input.chapterId, done: stored, total: pages.length });

    await pool(toStore, PAGE_CONCURRENCY, async ({ url, resp }) => {
      const buf = await resp.clone().arrayBuffer();
      size += buf.byteLength;
      await cache.put(url, resp);
      stored++;
      const p = { chapterId: input.chapterId, done: stored, total: pages.length };
      onProgress?.(p);
      setProgress(p);
    });

    // 3. Manifesto marca o capítulo como completo (cache-only no SW).
    // Guarda também as URLs para o removeChapter poder apagar cada página.
    const entry: DownloadedChapter = {
      ...input,
      pageCount: pages.length,
      sizeBytes: size,
      downloadedAt: Date.now(),
    };
    await cache.put(
      manifestKey(input.chapterId),
      new Response(JSON.stringify({ ...entry, urls: pages }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    // 4. Registra no store
    const cur = read().entries.filter((e) => e.chapterId !== input.chapterId);
    write({
      entries: [entry, ...cur].sort(
        (a, b) =>
          a.mangaTitle.localeCompare(b.mangaTitle, "pt-BR") ||
          langWeight(a.lang) - langWeight(b.lang),
      ),
      progress: {},
    });
    return entry;
  } finally {
    setProgress(null);
    onProgress?.({ chapterId: input.chapterId, done: 0, total: 0, indeterminate: false });
  }
}

/** Remove o capítulo baixado (páginas + manifesto + registro). */
export async function removeChapter(chapterId: string): Promise<void> {
  const cache = await caches.open(DL_CACHE);
  const entry = read().entries.find((e) => e.chapterId === chapterId);
  if (entry) {
    // Deleta todas as chaves do cache que pertençam a este capítulo.
    // As URLs das páginas apontam para /api/img?u=... — não dá pra derivar
    // a lista do manifesto (que só tem metadados), então varremos as keys
    // comparando com o padrão do proxy. Para não varrer o cache inteiro a
    // cada remoção, guardamos as URLs no manifesto:
    const mf = await cache.match(manifestKey(chapterId));
    if (mf) {
      const data = (await mf.json()) as DownloadedChapter & { urls?: string[] };
      for (const u of data.urls ?? []) await cache.delete(u);
    }
  }
  await cache.delete(manifestKey(chapterId));
  write({
    entries: read().entries.filter((e) => e.chapterId !== chapterId),
    progress: {},
  });}

/**
 * Retorna as páginas em cache (URLs reais) de um capítulo baixado.
 * Serve de fallback quando o usuário abre o leitor sem internet.
 */
export async function getDownloadedPages(chapterId: string): Promise<string[] | null> {
  try {
    const cache = await caches.open(DL_CACHE);
    const mf = await cache.match(manifestKey(chapterId));
    if (!mf) return null;
    const data = (await mf.json()) as DownloadedChapter & { urls?: string[] };
    return data.urls ?? null;
  } catch {
    return null;
  }
}

export async function isChapterDownloaded(chapterId: string): Promise<boolean> {
  try {
    const cache = await caches.open(DL_CACHE);
    return !!(await cache.match(manifestKey(chapterId)));
  } catch {
    return false;
  }
}
