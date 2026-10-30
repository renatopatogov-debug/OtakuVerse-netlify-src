"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clapperboard,
  Flame,
  Play,
  Sparkles,
  Star,
  Youtube,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fetchJson, useAsync } from "./use-async";
import { GENRE_PT, Poster } from "./cards";
import type { Nav } from "./types";
import type { AniListMedia } from "@/lib/anilist";
import { cn } from "@/lib/utils";

const SLIDE_MS = 7000;

/**
 * Tenta abrir o anime no catálogo Otakulogia testando candidatos de título
 * (inglês → romaji → base sem sufixo de temporada) em cascata.
 * Se nada bater, abre a busca unificada com o título original.
 */
function candidateTitles(m: AniListMedia): string[] {
  const raw = [m.title.english, m.title.romaji].filter(
    (t): t is string => !!t,
  );
  const cleaned = raw.map((t) =>
    t
      .replace(/\s*\d+(st|nd|rd|th)\s+Season/gi, "")
      .replace(/\s+Season\s+\d+/gi, "")
      .replace(/\s+Part\s+\d+/gi, "")
      .replace(/\s+S\d+$/gi, "")
      .replace(/\s+Court\s+Season/gi, "")
      .trim(),
  );
  return [...new Set([...raw, ...cleaned])]
    .filter((t) => t.trim().length > 1)
    .slice(0, 4);
}

async function openAnime(media: AniListMedia, nav: Nav) {
  for (const title of candidateTitles(media)) {
    try {
      const r = await fetchJson<{ items: { upstreamCid: number }[] }>(
        `/api/anime/search?q=${encodeURIComponent(title)}&limit=1`,
      );
      if (r.items?.length) {
        nav.push({ t: "anime-detail", cid: r.items[0].upstreamCid });
        return;
      }
    } catch {
      /* tenta o próximo candidato */
    }
  }
  const fallback = media.title.english || media.title.romaji || "";
  nav.push({ t: "search", q: fallback });
}

function scoreLabel(m: AniListMedia) {
  return m.averageScore ? (m.averageScore / 10).toFixed(1) : null;
}

function genresLabel(m: AniListMedia, max = 3) {
  return m.genres.slice(0, max).map((g) => GENRE_PT[g] ?? g);
}

/* ---------- Modal de trailer ---------- */

export function TrailerDialog({
  media,
  onClose,
}: {
  media: AniListMedia | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!media} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl border-none bg-black p-0">
        <DialogTitle className="sr-only">
          Trailer de {media?.title.romaji ?? "anime"}
        </DialogTitle>
        {media?.trailer?.site === "youtube" ? (
          <div className="aspect-video w-full">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${media.trailer.id}?autoplay=1&rel=0`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="h-full w-full rounded-lg"
              title={`Trailer — ${media.title.romaji ?? ""}`}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Carrossel principal ---------- */

function HeroCarousel({ items, nav }: { items: AniListMedia[]; nav: Nav }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [trailer, setTrailer] = useState<AniListMedia | null>(null);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [paused, items.length]);

  return (
    <>
      <section
        className="relative overflow-hidden rounded-2xl border border-border/60 bg-black"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        aria-roledescription="carrossel"
        aria-label="Animes em alta"
      >
        <div className="relative h-[400px] md:h-[500px]">
          {items.map((m, i) => {
            const active = i === idx;
            const img = m.bannerImage || m.coverImage?.extraLarge || null;
            return (
              <div
                key={m.id}
                aria-hidden={!active}
                className={cn(
                  "absolute inset-0 transition-opacity duration-1000",
                  active
                    ? "z-10 opacity-100"
                    : "pointer-events-none z-0 opacity-0",
                )}
              >
                {img ? (
                  <img
                    src={img}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-950 via-violet-950 to-background" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
                <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/25 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-5 md:p-10">
                  <div className="max-w-2xl">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-950/50 px-2.5 py-1 text-[11px] font-bold text-amber-300 backdrop-blur">
                        <Flame className="h-3 w-3" /> #{i + 1} em alta hoje
                      </span>
                      {scoreLabel(m) ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-amber-400 backdrop-blur">
                          <Star className="h-3 w-3" fill="currentColor" />
                          {scoreLabel(m)}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-2xl font-extrabold leading-tight drop-shadow-lg md:text-5xl">
                      {m.title.english || m.title.romaji}
                    </h2>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-300 md:text-sm">
                      {m.seasonYear ? <span>{m.seasonYear}</span> : null}
                      {m.episodes ? <span>• {m.episodes} eps</span> : null}
                      {genresLabel(m).map((g) => (
                        <span
                          key={g}
                          className="rounded bg-white/10 px-2 py-0.5 font-medium backdrop-blur"
                        >
                          {g}
                        </span>
                      ))}
                    </p>
                    {m.description ? (
                      <p className="mt-2 line-clamp-2 max-w-xl text-xs text-zinc-400 md:text-sm">
                        {m.description}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      <button
                        onClick={() => openAnime(m, nav)}
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/50 transition-transform hover:scale-[1.04]"
                      >
                        <Play className="h-4 w-4" fill="currentColor" />
                        Assistir
                      </button>
                      {m.trailer?.site === "youtube" ? (
                        <button
                          onClick={() => setTrailer(m)}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-black/50 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-black/70"
                        >
                          <Youtube className="h-4 w-4 text-red-500" />
                          Trailer
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Dots de navegação */}
          <div className="absolute right-4 top-4 flex flex-col gap-1.5 md:right-6 md:top-6">
            {items.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setIdx(i)}
                aria-label={`Ir para ${m.title.romaji ?? m.id}`}
                aria-current={i === idx}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === idx
                    ? "w-6 bg-fuchsia-400"
                    : "w-3 bg-white/40 hover:bg-white/70",
                )}
              />
            ))}
          </div>
        </div>
      </section>
      <TrailerDialog media={trailer} onClose={() => setTrailer(null)} />
    </>
  );
}

/* ---------- Card da prateleira trending ---------- */

function TrendingCard({
  media,
  rank,
  nav,
}: {
  media: AniListMedia;
  rank: number;
  nav: Nav;
}) {
  return (
    <button
      onClick={() => openAnime(media, nav)}
      className="group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Ver ${media.title.english || media.title.romaji}`}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-amber-500/60 group-hover:shadow-lg group-hover:shadow-amber-950/30">
        <div className="aspect-[2/3] w-full">
          <Poster
            src={media.coverImage?.extraLarge || media.coverImage?.large}
            alt={media.title.english || media.title.romaji || ""}
            icon="anime"
            className="h-full w-full"
          />
        </div>
        <span className="absolute left-1.5 top-1.5 rounded bg-amber-500/95 px-1.5 py-0.5 text-[10px] font-black text-black">
          #{rank}
        </span>
        {media.averageScore ? (
          <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur">
            <Star className="h-2.5 w-2.5" fill="currentColor" />
            {(media.averageScore / 10).toFixed(1)}
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-tight group-hover:text-amber-300">
        {media.title.english || media.title.romaji}
      </p>
    </button>
  );
}

/* ---------- Hero estático (fallback se o AniList cair) ---------- */

function StaticHero({ nav }: { nav: Nav }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-fuchsia-950/60 via-violet-950/40 to-background px-6 py-10 md:px-12 md:py-14">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl"
        aria-hidden
      />
      <div className="relative max-w-2xl">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/40 bg-fuchsia-950/50 px-3 py-1 text-xs font-medium text-fuchsia-300">
          <Sparkles className="h-3.5 w-3.5" />
          MangaDex + Otakulogia + AniList
        </span>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
          Animes e Mangás,
          <br />
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
            num só lugar.
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground md:text-base">
          Assista episódios dublados e legendados, explore o catálogo por gênero
          e leia milhares de mangás — tudo em uma única experiência.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => nav.replaceAll({ t: "animes" })}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/40 transition-transform hover:scale-[1.03]"
          >
            <Play className="h-4 w-4" />
            Explorar animes
          </button>
          <button
            onClick={() => nav.replaceAll({ t: "mangas" })}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-950/40 px-5 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-950/70"
          >
            <Clapperboard className="h-4 w-4" />
            Explorar mangás
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Seção completa: carrossel + prateleira ---------- */

export function TrendingSection({ nav }: { nav: Nav }) {
  const trending = useAsync<{ items: AniListMedia[] }>(
    () => fetchJson("/api/anilist/trending?limit=8"),
    "trending",
  );

  if (trending.loading && !trending.data) {
    return (
      <div
        className="relative h-[400px] animate-pulse rounded-2xl bg-zinc-800/60 md:h-[500px]"
        aria-label="Carregando destaques"
      />
    );
  }

  const items = trending.data?.items ?? [];
  if (trending.error || items.length === 0) {
    return <StaticHero nav={nav} />;
  }

  return (
    <div className="space-y-10">
      <HeroCarousel items={items} nav={nav} />
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Flame className="h-5 w-5 text-amber-400" />
          Em alta agora
          <span className="text-xs font-normal text-muted-foreground">
            via AniList
          </span>
        </h2>
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {items.map((m, i) => (
            <TrendingCard key={m.id} media={m} rank={i + 1} nav={nav} />
          ))}
        </div>
      </section>
    </div>
  );
}
