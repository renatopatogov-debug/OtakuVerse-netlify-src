"use client";
import { useState } from "react";
import { BookOpen, Clapperboard, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/* Gêneros do AniList traduzidos pra exibição em pt-BR. */
export const GENRE_PT: Record<string, string> = {
  Action: "Ação",
  Adventure: "Aventura",
  Comedy: "Comédia",
  Drama: "Drama",
  Ecchi: "Ecchi",
  Fantasy: "Fantasia",
  Horror: "Terror",
  "Mahou Shoujo": "Mahou Shoujo",
  Mecha: "Mecha",
  Music: "Música",
  Mystery: "Mistério",
  Psychological: "Psicológico",
  Romance: "Romance",
  "Sci-Fi": "Ficção Científica",
  "Slice of Life": "Slice of Life",
  Sports: "Esportes",
  Supernatural: "Sobrenatural",
  Thriller: "Suspense",
};

/* ---------- Poster com fallback ---------- */

export function Poster({
  src,
  alt,
  className,
  icon,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  icon: "anime" | "manga";
}) {
  const [failed, setFailed] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const Icon = icon === "anime" ? Clapperboard : BookOpen;

  useEffect(() => {
    setCurrentSrc(src);
    setFailed(false);
  }, [src]);

  if (!currentSrc || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-fuchsia-950 text-zinc-600",
          className,
        )}
      >
        <Icon className="h-8 w-8" aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={currentSrc}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (currentSrc && !currentSrc.startsWith("/api/img") && currentSrc.includes("mangadex.org")) {
          // Se a CDN direta falhar por bloqueio de DNS de operadora, tenta o proxy same-origin como fallback
          setCurrentSrc(`/api/img?u=${encodeURIComponent(currentSrc)}`);
        } else {
          setFailed(true);
        }
      }}
      className={cn("object-cover", className)}
    />
  );
}

/* ---------- Badges ---------- */

export function AudioBadges({ audioMix }: { audioMix?: string | null }) {
  if (!audioMix) return null;
  const parts = audioMix.split(",").map((s) => s.trim().toUpperCase());
  return (
    <div className="flex gap-1">
      {parts.includes("DUB") && (
        <span className="rounded bg-fuchsia-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
          DUB
        </span>
      )}
      {parts.includes("LEG") && (
        <span className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
          LEG
        </span>
      )}
    </div>
  );
}

const STATUS_PT: Record<string, string> = {
  ongoing: "Em andamento",
  completed: "Concluído",
  hiatus: "Em hiato",
  cancelled: "Cancelado",
};

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  return (
    <span className="rounded bg-zinc-700/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-200">
      {STATUS_PT[status] ?? status}
    </span>
  );
}

/* ---------- Cartão de anime ---------- */

export interface AnimeItemUI {
  id: string;
  upstreamCid: number;
  name: string;
  year?: number | null;
  posterUrl?: string | null;
  audioMix?: string | null;
  hasNewEpisode?: boolean | null;
}

export function AnimeCard({
  anime,
  score,
  onClick,
}: {
  anime: AnimeItemUI;
  score?: number | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      aria-label={`Ver ${anime.name}`}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-fuchsia-500/60 group-hover:shadow-lg group-hover:shadow-fuchsia-950/40">
        <div className="aspect-[2/3] w-full">
          <Poster
            src={anime.posterUrl}
            alt={anime.name}
            icon="anime"
            className="h-full w-full"
          />
        </div>
        {anime.hasNewEpisode && (
          <span className="absolute left-1.5 top-1.5 animate-pulse rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
            NOVO EP
          </span>
        )}
        <div className="absolute right-1.5 top-1.5">
          <AudioBadges audioMix={anime.audioMix} />
        </div>
        {score ? (
          <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur">
            <Star className="h-2.5 w-2.5" fill="currentColor" />
            {(score / 10).toFixed(1)}
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-tight text-foreground group-hover:text-fuchsia-300">
        {anime.name}
      </p>
      {anime.year ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{anime.year}</p>
      ) : null}
    </button>
  );
}

/* ---------- Cartão de mangá ---------- */

export interface MangaItemUI {
  id: string;
  title: string;
  year?: number | null;
  status?: string | null;
  coverUrl: string | null;
}

export function MangaCard({
  manga,
  onClick,
}: {
  manga: MangaItemUI;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      aria-label={`Ver ${manga.title}`}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-emerald-500/60 group-hover:shadow-lg group-hover:shadow-emerald-950/40">
        <div className="aspect-[2/3] w-full">
          <Poster
            src={manga.coverUrl}
            alt={manga.title}
            icon="manga"
            className="h-full w-full"
          />
        </div>
        <div className="absolute left-1.5 top-1.5">
          <StatusBadge status={manga.status} />
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-tight text-foreground group-hover:text-emerald-300">
        {manga.title}
      </p>
      {manga.year ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{manga.year}</p>
      ) : null}
    </button>
  );
}

/* ---------- Grid responsivo reutilizável ---------- */

export function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {children}
    </div>
  );
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <CardGrid>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[2/3] w-full rounded-xl bg-zinc-800/70" />
          <div className="mt-2 h-3.5 w-4/5 rounded bg-zinc-800/70" />
          <div className="mt-1.5 h-3 w-1/3 rounded bg-zinc-800/50" />
        </div>
      ))}
    </CardGrid>
  );
}
