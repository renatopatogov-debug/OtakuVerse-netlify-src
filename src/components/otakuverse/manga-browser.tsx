"use client";

import { useEffect, useState } from "react";
import { Loader2, SearchX, BookOpen } from "lucide-react";
import { fetchJson } from "./use-async";
import { MangaCard, GridSkeleton, type MangaItemUI } from "./cards";
import type { Nav } from "./types";

const PAGE = 24;

export function MangaBrowser({ nav }: { nav: Nav }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 450);
    return () => clearTimeout(t);
  }, [term]);

  const listKey = debounced ? `search:${debounced}` : "popular";

  const [result, setResult] = useState<{
    key: string;
    items: MangaItemUI[];
    total: number;
    error: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const items = result?.key === listKey ? result.items : [];
  const total = result?.key === listKey ? result.total : 0;
  const loading = result?.key !== listKey;
  const error = result?.key === listKey ? result.error : null;

  const buildUrl = (offset: number) =>
    debounced
      ? "/api/manga/search?" +
        new URLSearchParams({ q: debounced, offset: String(offset), limit: String(PAGE) })
      : "/api/manga/popular?" +
        new URLSearchParams({ offset: String(offset), limit: String(PAGE) });

  useEffect(() => {
    let alive = true;
    fetchJson<{ total: number; items: MangaItemUI[] }>(buildUrl(0))
      .then((d) => {
        if (alive)
          setResult({ key: listKey, items: d.items, total: d.total, error: null });
      })
      .catch((e) => {
        if (alive)
          setResult({
            key: listKey,
            items: [],
            total: 0,
            error: e instanceof Error ? e.message : "Erro",
          });
      });
    return () => {
      alive = false;
    };
  }, [listKey]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await fetchJson<{ total: number; items: MangaItemUI[] }>(
        buildUrl(items.length),
      );
      setResult((prev) => {
        if (!prev || prev.key !== listKey) return prev;
        const seen = new Set(prev.items.map((x) => x.id));
        return {
          ...prev,
          items: [...prev.items, ...d.items.filter((x) => !seen.has(x.id))],
        };
      });
    } catch {
      /* silencioso */
    }
    setLoadingMore(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-emerald-400" />
        <h1 className="text-2xl font-bold">Mangás</h1>
        {!loading && (
          <span className="ml-auto text-sm text-muted-foreground">
            {total.toLocaleString("pt-BR")} títulos
          </span>
        )}
      </div>

      <div className="relative max-w-xl">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar mangá por nome (via MangaDex)..."
          className="h-10 w-full rounded-lg border border-input bg-card/70 px-3 text-sm placeholder:text-muted-foreground focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
          aria-label="Buscar mangá por nome"
        />
        {debounced !== term.trim() && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {loading ? (
        <GridSkeleton />
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive">
          Falha ao carregar: {error}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 py-16 text-muted-foreground">
          <SearchX className="h-10 w-10" />
          <p className="text-sm">Nenhum mangá encontrado.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((m) => (
              <MangaCard
                key={m.id}
                manga={m}
                onClick={() => nav.push({ t: "manga-detail", id: m.id })}
              />
            ))}
          </div>
          {items.length < total ? (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-6 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-950/60 disabled:opacity-60"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {loadingMore ? "Carregando..." : "Carregar mais"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
