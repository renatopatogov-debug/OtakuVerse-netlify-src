"use client";

import { Clapperboard, SearchX } from "lucide-react";
import { fetchJson, useAniListScores, useAsync } from "./use-async";
import {
  AnimeCard,
  GridSkeleton,
  MangaCard,
  type AnimeItemUI,
  type MangaItemUI,
} from "./cards";
import type { Nav } from "./types";
import { FallbackSection } from "./fallback-detail";

export function SearchView({ q, nav }: { q: string; nav: Nav }) {
  const animes = useAsync<{ total: number; items: AnimeItemUI[] }>(
    () => fetchJson(`/api/anime/search?q=${encodeURIComponent(q)}&limit=12`),
    `search-anime:${q}`,
  );
  const mangas = useAsync<{ total: number; items: MangaItemUI[] }>(
    () => fetchJson(`/api/manga/search?q=${encodeURIComponent(q)}&limit=12`),
    `search-manga:${q}`,
  );

  const scores = useAniListScores(animes.data?.items);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">
          Resultados para{" "}
          <span className="text-fuchsia-400">“{q}”</span>
        </h1>
      </div>

      {/* Animes */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Clapperboard className="h-5 w-5 text-fuchsia-400" />
          Animes
          {animes.data ? (
            <span className="text-sm font-normal text-muted-foreground">
              ({animes.data.total})
            </span>
          ) : null}
        </h2>
        {animes.loading ? (
          <GridSkeleton count={6} />
        ) : animes.error ? (
          <div className="space-y-5">
            <p className="text-sm text-destructive">Erro: {animes.error}</p>
            <FallbackSection q={q} nav={nav} />
          </div>
        ) : animes.data && animes.data.items.length > 0 ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6">
            {animes.data.items.map((a) => (
              <AnimeCard
                key={a.id}
                anime={a}
                score={scores?.[a.id] ?? null}
                onClick={() => nav.push({ t: "anime-detail", cid: a.upstreamCid })}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 py-8 text-sm text-muted-foreground">
              <SearchX className="h-4 w-4" /> Nenhum anime encontrado na fonte
              primária.
            </div>
            <FallbackSection q={q} nav={nav} />
          </div>
        )}
      </section>

      {/* Mangás */}
      <section>
        <h2 className="mb-3 text-lg font-bold">
          <span className="text-emerald-400">📖</span> Mangás
          {mangas.data ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({mangas.data.total})
            </span>
          ) : null}
        </h2>
        {mangas.loading ? (
          <GridSkeleton count={6} />
        ) : mangas.error ? (
          <p className="text-sm text-destructive">Erro: {mangas.error}</p>
        ) : mangas.data && mangas.data.items.length > 0 ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6">
            {mangas.data.items.map((m) => (
              <MangaCard
                key={m.id}
                manga={m}
                onClick={() => nav.push({ t: "manga-detail", id: m.id })}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 py-8 text-sm text-muted-foreground">
            <SearchX className="h-4 w-4" /> Nenhum mangá encontrado.
          </div>
        )}
      </section>
    </div>
  );
}
