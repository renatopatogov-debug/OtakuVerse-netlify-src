"use client";

// Prateleira "Continuar Assistindo" — últimos episódios/capítulos com
// progresso real do vídeo, salvos no navegador (localStorage).
// Cards 16:9 estilo streaming com barra de progresso, badge de áudio e
// botão de remover. Retomar navega direto pro episódio salvo.

import { BookOpen, History, Play, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatchHistory, watchPercent, type WatchEntry } from "@/lib/local-store";
import { Poster } from "./cards";
import type { Nav } from "./types";

function resumeTarget(e: WatchEntry) {
  switch (e.source) {
    case "otakulogia":
      return e.cid != null
        ? ({ t: "anime-detail", cid: e.cid, epId: e.episodeId } as const)
        : null;
    case "sfhd":
      return e.seriesId
        ? ({ t: "sfhd-detail", seriesId: e.seriesId, epId: e.episodeId } as const)
        : null;
    case "fallback":
      return e.slug
        ? ({ t: "fallback-detail", slug: e.slug, epId: e.episodeId } as const)
        : null;
    case "manga":
      return e.mangaId
        ? ({ t: "manga-detail", id: e.mangaId, chapterId: e.episodeId } as const)
        : null;
  }
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${m}:${String(ss).padStart(2, "0")}`;
}

function ContinueCard({
  entry,
  nav,
}: {
  entry: WatchEntry;
  nav: Nav;
}) {
  const { remove } = useWatchHistory();
  const pct = watchPercent(entry);
  const isManga = entry.source === "manga";
  const target = resumeTarget(entry);

  return (
    <div className="group relative w-44 shrink-0 sm:w-52">
      <button
        onClick={() => {
          if (target) nav.push({ ...target });
        }}
        disabled={!target}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl disabled:cursor-not-allowed"
        aria-label={`Continuar ${entry.title}${entry.episodeNumber ? (isManga ? `, capítulo ${entry.episodeNumber}` : `, episódio ${entry.episodeNumber}`) : ""}`}
      >
        {/* Capa 16:9 */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-fuchsia-500/60 group-hover:shadow-lg group-hover:shadow-fuchsia-950/40">
          {entry.thumbUrl ? (
            <img
              src={entry.thumbUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : entry.posterUrl ? (
            <>
              <Poster
                src={entry.posterUrl}
                alt=""
                icon={isManga ? "manga" : "anime"}
                className="absolute inset-0 h-full w-full scale-110 opacity-40 blur-sm"
              />
              <Poster
                src={entry.posterUrl}
                alt=""
                icon={isManga ? "manga" : "anime"}
                className="absolute left-2 top-1/2 h-[80%] -translate-y-1/2 aspect-[2/3] rounded-md shadow-xl"
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-fuchsia-950 text-zinc-600">
              {isManga ? <BookOpen className="h-8 w-8" /> : <Play className="h-8 w-8" />}
            </div>
          )}

          {/* Badge EP/CAP + áudio */}
          <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold text-white",
                isManga ? "bg-emerald-600/90" : "bg-black/75 backdrop-blur",
              )}
            >
              {isManga ? `CAP ${entry.episodeNumber ?? "?"}` : `EP ${entry.episodeNumber ?? "?"}`}
            </span>
            {!isManga && entry.audio ? (
              <span
                className={cn(
                  "rounded px-1 py-0.5 text-[9px] font-bold text-white",
                  entry.audio === "dublado" ? "bg-fuchsia-600/90" : "bg-emerald-600/90",
                )}
              >
                {entry.audio === "dublado" ? "DUB" : "LEG"}
              </span>
            ) : null}
          </div>

          {/* Ícone de play no hover */}
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-xl">
              <Play className="ml-0.5 h-5 w-5 text-black" fill="currentColor" />
            </span>
          </span>

          {/* Barra de progresso */}
          {pct != null ? (
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/60">
              <div
                className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-400 progress-glow"
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
        </div>

        {/* Título + tempo */}
        <p className="mt-2 line-clamp-1 text-sm font-medium leading-tight group-hover:text-fuchsia-300">
          {entry.title}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {entry.episodeTitle
            ? entry.episodeTitle
            : isManga
              ? "Continuar leitura"
              : "Continuar episódio"}
          {pct != null && entry.duration > 0
            ? ` · ${formatTime(entry.position)} / ${formatTime(entry.duration)}`
            : ""}
        </p>
      </button>

      {/* Remover */}
      <button
        onClick={() => remove(entry.key)}
        className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white/70 opacity-0 backdrop-blur transition-all hover:bg-rose-950/90 hover:text-rose-300 group-hover:opacity-100"
        aria-label={`Remover ${entry.title} do histórico`}
        title="Remover do histórico"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ContinueWatching({ nav }: { nav: Nav }) {
  const { entries, clear } = useWatchHistory();

  if (entries.length === 0) return null;

  return (
    <section className="animate-fade-up" aria-label="Continuar assistindo">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <span className="text-fuchsia-400">
            <History className="h-5 w-5" />
          </span>
          Continuar assistindo
        </h2>
        <button
          onClick={() => {
            if (window.confirm("Limpar todo o histórico de continuidade?"))
              clear();
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-rose-300"
          aria-label="Limpar histórico"
        >
          <Trash2 className="h-3 w-3" /> Limpar
        </button>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {entries.slice(0, 16).map((e) => (
          <ContinueCard key={e.key} entry={e} nav={nav} />
        ))}
      </div>
    </section>
  );
}
