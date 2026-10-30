// Persistência local do OtakuVerse (localStorage + store reativo).
//
// Três domínios:
//   - Histórico de leitura/audição (WatchEntry) → "otv:history:v1"
//   - Favoritos (FavEntry)                      → "otv:favorites:v1"
//   - Preferência de áudio (dub/leg)            → "otv:audio-pref:v1"
//
// Os stores são reativos: hooks usam useSyncExternalStore, então componentes
// (header, library, home) re-renderizam sozinhos quando qualquer tela salva
// progresso ou favorita algo. O formato das keys dos itens carrega a fonte no
// prefixo (ol: / sfhd: / fb: / av: / mg:) — a UI usa isso para saber pra onde
// navegar ao retomar.

import { useCallback, useSyncExternalStore } from "react";

/* ---------- Tipos ---------- */

export type WatchSource =
  | "otakulogia"
  | "sfhd"
  | "fallback"
  | "av"
  | "manga";

export interface WatchEntry {
  /** Chave única: `{fonte}:{ids...}:{episódio}` — ex. `ol:123:456`, `mg:<uuid>`. */
  key: string;
  source: WatchSource;
  title: string;
  posterUrl: string | null;
  thumbUrl?: string | null;
  cid?: number | null;
  seriesId?: string | null;
  slug?: string | null;
  mangaId?: string | null;
  episodeId: string;
  episodeNumber: number | null;
  episodeTitle: string | null;
  audio?: "dublado" | "legendado" | null;
  lang?: "pt-br" | "en" | null;
  /** Segundos assistidos / lidos até agora. */
  position: number;
  /** Duração total em segundos (0 para mangá). */
  duration: number;
  /** Epoch ms da última atualização (gerenciado pelo store). */
  updatedAt: number;
}

export interface FavEntry {
  key: string;
  kind: "anime" | "manga";
  title: string;
  posterUrl: string | null;
  cid?: number | null;
  seriesId?: string | null;
  slug?: string | null;
  mangaId?: string | null;
  /** Ex.: "LEG", "LEG+DUB", "DUB". */
  audioMix?: string | null;
  year?: number | null;
  /** Epoch ms da inclusão (gerenciado pelo store). */
  addedAt: number;
}

export type AudioPref = "dub" | "leg" | null;

/** Entrada aceita por saveWatchProgress (updatedAt é calculado aqui). */
export type WatchInput = Omit<WatchEntry, "updatedAt">;

/** Base aceita por useProgressSaver (position/duration chegam como argumentos). */
export type WatchProgressBase = Omit<
  WatchEntry,
  "updatedAt" | "position" | "duration"
>;

/* ---------- Infra de store reativo ---------- */

const HISTORY_KEY = "otv:history:v1";
const FAVS_KEY = "otv:favorites:v1";
const AUDIO_KEY = "otv:audio-pref:v1";
const HISTORY_LIMIT = 80;
const FAVS_LIMIT = 200;

const EMPTY_WATCH: WatchEntry[] = [];
const EMPTY_FAVS: FavEntry[] = [];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota cheia / modo privado — falha silenciosa, o app segue funcionando.
  }
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Snapshots em cache (identidade estável é exigência do useSyncExternalStore). */

let watchCache: WatchEntry[] | null = null;
function getWatchSnapshot(): WatchEntry[] {
  if (watchCache === null) {
    watchCache = readJson<WatchEntry[]>(HISTORY_KEY, EMPTY_WATCH).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }
  return watchCache;
}

let favsCache: FavEntry[] | null = null;
function getFavsSnapshot(): FavEntry[] {
  if (favsCache === null) {
    favsCache = readJson<FavEntry[]>(FAVS_KEY, EMPTY_FAVS).sort(
      (a, b) => b.addedAt - a.addedAt,
    );
  }
  return favsCache;
}

/* ---------- Histórico de progresso ---------- */

export function getWatchHistory(): WatchEntry[] {
  return getWatchSnapshot();
}

/** Salva/atualiza a posição de um episódio-capítulo e move pro topo do histórico. */
export function saveWatchProgress(input: WatchInput): void {
  const list = getWatchSnapshot().filter((e) => e.key !== input.key);
  const entry: WatchEntry = {
    ...input,
    // Mangá salva duration 0; garante números válidos p/ evitar NaN no pct.
    position: Number.isFinite(input.position) ? Math.max(0, input.position) : 0,
    duration: Number.isFinite(input.duration) ? Math.max(0, input.duration) : 0,
    updatedAt: Date.now(),
  };
  watchCache = [entry, ...list].slice(0, HISTORY_LIMIT);
  writeJson(HISTORY_KEY, watchCache);
  emit();
}

/** Considerado "concluído" quando ≥95% da duração foi consumida. */
export function isWatched(e: Pick<WatchEntry, "position" | "duration">): boolean {
  if (!e.duration || e.duration <= 0) return false;
  return e.position / e.duration >= 0.95;
}

/** Percentual 1–99 para exibição; null quando não há duração/progresso útil. */
export function watchPercent(
  e: Pick<WatchEntry, "position" | "duration">,
): number | null {
  if (!e.duration || e.duration <= 0) return null;
  const pct = Math.round((e.position / e.duration) * 100);
  if (pct <= 0) return null;
  return Math.min(pct, 99);
}

function removeWatchEntry(key: string): void {
  const next = getWatchSnapshot().filter((e) => e.key !== key);
  if (next.length === getWatchSnapshot().length) return;
  watchCache = next;
  writeJson(HISTORY_KEY, watchCache);
  emit();
}

function clearWatchHistory(): void {
  watchCache = EMPTY_WATCH;
  writeJson(HISTORY_KEY, watchCache);
  emit();
}

export function useWatchHistory(): {
  entries: WatchEntry[];
  remove: (key: string) => void;
  clear: () => void;
} {
  const entries = useSyncExternalStore(subscribe, getWatchSnapshot, () => EMPTY_WATCH);
  const remove = useCallback((key: string) => removeWatchEntry(key), []);
  const clear = useCallback(() => clearWatchHistory(), []);
  return { entries, remove, clear };
}

/* ---------- Favoritos ---------- */

export function useFavorites(): {
  entries: FavEntry[];
  isFav: (key: string) => boolean;
  toggle: (entry: Omit<FavEntry, "addedAt">) => void;
} {
  const entries = useSyncExternalStore(subscribe, getFavsSnapshot, () => EMPTY_FAVS);
  const isFav = useCallback(
    (key: string) => getFavsSnapshot().some((f) => f.key === key),
    [],
  );
  const toggle = useCallback((entry: Omit<FavEntry, "addedAt">) => {
    const list = getFavsSnapshot();
    if (list.some((f) => f.key === entry.key)) {
      favsCache = list.filter((f) => f.key !== entry.key);
    } else {
      const full: FavEntry = { ...entry, addedAt: Date.now() };
      favsCache = [full, ...list].slice(0, FAVS_LIMIT);
    }
    writeJson(FAVS_KEY, favsCache);
    emit();
  }, []);
  return { entries, isFav, toggle };
}

/* ---------- Preferência de áudio (LEG/DUB global) ---------- */

let audioCache: AudioPref | null | undefined;

function getAudioSnapshot(): AudioPref {
  if (audioCache === undefined) {
    const raw = readJson<AudioPref>(AUDIO_KEY, null);
    audioCache = raw === "dub" || raw === "leg" ? raw : null;
  }
  return audioCache;
}

export function usePreferredAudio(): readonly [
  AudioPref,
  (v: AudioPref) => void,
] {
  const pref = useSyncExternalStore(subscribe, getAudioSnapshot, () => null);
  const setPref = useCallback((v: AudioPref) => {
    audioCache = v;
    writeJson(AUDIO_KEY, v);
    emit();
  }, []);
  return [pref, setPref] as const;
}

/* ---------- Salvador de progresso com throttle ---------- */

/**
 * Hook do player: retorna saveProgress(entry, position, duration, force?).
 * Grava no máximo 1× a cada `intervalSeconds` (padrão 5s) para não martelar o
 * localStorage em todo timeupdate; o último tick pendente é gravado com
 * atraso (trailing), então nada se perde ao pausar/fechar. `force=true`
 * grava imediatamente (usado no primeiro tick, p/ entrar no histórico).
 */
export function useProgressSaver(intervalSeconds = 5) {
  type Pending = { entry: WatchProgressBase; position: number; duration: number };
  let lastWrite = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Pending | null = null;

  const flush = () => {
    timer = null;
    if (!pending) return;
    const { entry, position, duration } = pending;
    pending = null;
    lastWrite = Date.now();
    saveWatchProgress({ ...entry, position, duration });
  };

  return (
    entry: WatchProgressBase,
    position: number,
    duration: number,
    force = false,
  ): void => {
    pending = { entry, position, duration };
    const now = Date.now();
    if (force || now - lastWrite >= intervalSeconds * 1000) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
      return;
    }
    if (!timer) {
      timer = setTimeout(flush, Math.max(0, lastWrite + intervalSeconds * 1000 - now));
    }
  };
}
