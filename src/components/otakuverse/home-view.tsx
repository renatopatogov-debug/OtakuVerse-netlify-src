"use client";

import { Clapperboard, Flame, Play } from "lucide-react";
import { fetchJson, useAniListScores, useAsync } from "./use-async";
import { TrendingSection } from "./hero";
import { ContinueWatching } from "./continue-watching";
import {
  AnimeCard,
  GridSkeleton,
  MangaCard,
  Poster,
  type AnimeItemUI,
  type MangaItemUI,
} from "./cards";
import type { Nav } from "./types";

function ShelfTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
      <span className="text-fuchsia-400">{icon}</span>
      {children}
    </h2>
  );
}

export function HomeView({ nav }: { nav: Nav }) {
  const animes = useAsync<{ total: number; items: AnimeItemUI[] }>(
    () => fetchJson("/api/anime/latest?limit=14"),
    "home:latest",
  );
  const mangas = useAsync<{ total: number; items: MangaItemUI[] }>(
    () => fetchJson("/api/manga/popular?limit=14"),
    "home:popular",
  );
  const scores = useAniListScores(animes.data?.items);

  const featured = animes.data?.items?.[0];

  return (
    <div className="space-y-10">
      {/* Hero carrossel + Em alta agora (AniList) com fallback estático */}
      <TrendingSection nav={nav} />

      {/* Continuar assistindo (histórico local do navegador) */}
      <ContinueWatching nav={nav} />

      {/* Destaque do dia (primeiro anime dos lançamentos) */}
      {featured ? (
        <section
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-card"
          onClick={() => nav.push({ t: "anime-detail", cid: featured.upstreamCid })}
        >
          <div className="relative h-44 md:h-60">
            <Poster
              src={featured.posterUrl}
              alt=""
              icon="anime"
              className="absolute inset-0 h-full w-full scale-110 opacity-30 blur-md"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
            <div className="absolute inset-0 flex items-center gap-4 p-5 md:gap-6 md:p-8">
              <div className="hidden w-28 shrink-0 overflow-hidden rounded-xl shadow-2xl sm:block md:w-36">
                <Poster
                  src={featured.posterUrl}
                  alt={featured.name}
                  icon="anime"
                  className="aspect-[2/3] h-auto w-full"
                />
              </div>
              <div className="min-w-0">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fuchsia-400">
                  <Flame className="h-3.5 w-3.5" /> Lançamento recente
                </p>
                <h3 className="truncate text-xl font-bold md:text-3xl">
                  {featured.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {featured.year ?? ""} {featured.audioMix ? `• ${featured.audioMix}` : ""}
                </p>
                <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur transition-colors group-hover:bg-fuchsia-600">
                  Ver episódios →
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Últimos animes */}
      <section>
        <ShelfTitle icon={<Clapperboard className="h-5 w-5" />}>
          Últimos animes lançados
        </ShelfTitle>
        {animes.loading ? (
          <GridSkeleton count={6} />
        ) : animes.error ? (
          <p className="text-sm text-destructive">Erro: {animes.error}</p>
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-7">
            {animes.data?.items.map((a) => (
              <AnimeCard
                key={a.id}
                anime={a}
                score={scores?.[a.id] ?? null}
                onClick={() => nav.push({ t: "anime-detail", cid: a.upstreamCid })}
              />
            ))}
          </div>
        )}
      </section>

      {/* Mangás em alta */}
      <section>
        <ShelfTitle
          icon={
            <span className="text-emerald-400">
              <Clapperboard className="h-5 w-5 rotate-180" />
            </span>
          }
        >
          Mangás em alta
        </ShelfTitle>
        {mangas.loading ? (
          <GridSkeleton count={6} />
        ) : mangas.error ? (
          <p className="text-sm text-destructive">Erro: {mangas.error}</p>
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-7">
            {mangas.data?.items.map((m) => (
              <MangaCard
                key={m.id}
                manga={m}
                onClick={() => nav.push({ t: "manga-detail", id: m.id })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
