"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, Loader2, SearchX } from "lucide-react";
import { fetchJson, useAniListScores, useAsync } from "./use-async";
import { AnimeCard, GridSkeleton, type AnimeItemUI } from "./cards";
import { FallbackSection } from "./fallback-detail";
import type { Nav } from "./types";
import type { CategoryItem } from "@/lib/otakulogia";

const PAGE = 24;

type Mode = { kind: "latest" } | { kind: "search"; q: string } | { kind: "cat"; categoryId: string };

export function AnimeBrowser({ nav }: { nav: Nav }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [audio, setAudio] = useState<"" | "DUB" | "LEG">("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 450);
    return () => clearTimeout(t);
  }, [term]);

  const categories = useAsync<{ items: CategoryItem[] }>(
    () => fetchJson("/api/anime/categories"),
    "categories",
  );

  const mode: Mode = categoryId
    ? { kind: "cat", categoryId }
    : debounced
      ? { kind: "search", q: debounced }
      : { kind: "latest" };

  const listKey = useMemo(() => {
    if (mode.kind === "cat") return `cat:${mode.categoryId}:${audio}`;
    if (mode.kind === "search") return `search:${mode.q}:${audio}`;
    return `latest:${audio}`;
  }, [mode, audio]);

  const [result, setResult] = useState<{
    key: string;
    items: AnimeItemUI[];
    total: number;
    error: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const items = result?.key === listKey ? result.items : [];
  const total = result?.key === listKey ? result.total : 0;
  const loading = result?.key !== listKey;
  const error = result?.key === listKey ? result.error : null;

  const buildUrl = (offset: number) => {
    if (mode.kind === "cat") {
      const p = new URLSearchParams({
        categoryId: mode.categoryId,
        offset: String(offset),
        limit: String(PAGE),
      });
      if (audio) p.set("audioType", audio);
      return "/api/anime/category?" + p.toString();
    }
    if (mode.kind === "search") {
      return (
        "/api/anime/search?" +
        new URLSearchParams({ q: mode.q, offset: String(offset), limit: String(PAGE) })
      );
    }
    const p = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
    if (audio) p.set("audioType", audio);
    return "/api/anime/latest?" + p.toString();
  };

  useEffect(() => {
    let alive = true;
    fetchJson<{ total: number; items: AnimeItemUI[] }>(buildUrl(0))
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
      const d = await fetchJson<{ total: number; items: AnimeItemUI[] }>(
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

  const genres = (categories.data?.items ?? []).filter((c) => c.kind === "GENRE");
  const scores = useAniListScores(items.length > 0 ? items : null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-6 w-6 text-fuchsia-400" />
        <h1 className="text-2xl font-bold">Animes</h1>
        {!loading && (
          <span className="ml-auto text-sm text-muted-foreground">
            {total.toLocaleString("pt-BR")} títulos
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_170px]">
        <div className="relative">
          <input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              if (e.target.value.trim()) setCategoryId("");
            }}
            placeholder="Buscar anime por nome..."
            className="h-10 w-full rounded-lg border border-input bg-card/70 px-3 text-sm placeholder:text-muted-foreground focus:border-fuchsia-500/70 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/70"
            aria-label="Buscar anime por nome"
          />
          {debounced !== term.trim() && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-10 rounded-lg border border-input bg-card/70 px-3 text-sm text-foreground focus:border-fuchsia-500/70 focus:outline-none"
          aria-label="Filtrar por gênero"
        >
          <option value="">Todos os gêneros</option>
          {genres.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.animeCount})
            </option>
          ))}
        </select>
        <select
          value={audio}
          onChange={(e) => setAudio(e.target.value as "" | "DUB" | "LEG")}
          className="h-10 rounded-lg border border-input bg-card/70 px-3 text-sm text-foreground focus:border-fuchsia-500/70 focus:outline-none"
          aria-label="Filtrar por áudio"
        >
          <option value="">Dublado e legendado</option>
          <option value="DUB">Dublado</option>
          <option value="LEG">Legendado</option>
        </select>
      </div>

      {/* Resultados */}
      {loading ? (
        <GridSkeleton />
      ) : error ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive">
            Falha ao carregar: {error}
          </div>
          {mode.kind === "search" ? <FallbackSection q={mode.q} nav={nav} /> : null}
        </div>
      ) : items.length === 0 ? (
        mode.kind === "search" ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 py-10 text-muted-foreground">
              <SearchX className="h-10 w-10" />
              <p className="text-sm">
                A fonte primária (Otakulogia) não tem nada para “{mode.q}”.
              </p>
            </div>
            <FallbackSection q={mode.q} nav={nav} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 py-16 text-muted-foreground">
            <SearchX className="h-10 w-10" />
            <p className="text-sm">Nenhum anime encontrado com esses filtros.</p>
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((a) => (
              <AnimeCard
                key={a.id}
                anime={a}
                score={scores?.[a.id] ?? null}
                onClick={() => nav.push({ t: "anime-detail", cid: a.upstreamCid })}
              />
            ))}
          </div>
          {items.length < total ? (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-500/40 bg-fuchsia-950/30 px-6 py-2.5 text-sm font-semibold text-fuchsia-300 transition-colors hover:bg-fuchsia-950/60 disabled:opacity-60"
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
