"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Play,
  TvMinimalPlay,
} from "lucide-react";
import { RangeAccordion, groupOfIndex } from "./collapsible-groups";
import { AudioPrefToggle } from "./library";
import {
  epNumFromTitle,
  zipEpisode,
  zipTitlePtBr,
} from "./anime-detail-helpers";
import type { AniZipMapping } from "@/lib/anizip";
import type { EpisodeInfo, SeasonInfo } from "@/lib/otakulogia";
import {
  type WatchEntry,
  isWatched,
  watchPercent,
} from "@/lib/local-store";
import { cn } from "@/lib/utils";

const EP_GROUP_SIZE = 25;

export function SeasonPicker({
  seasons,
  seasonIdx,
  onSelect,
}: {
  seasons: SeasonInfo[];
  seasonIdx: number;
  onSelect: (i: number) => void;
}) {
  // Poucas temporadas: já abre expandido. Muitas: recolhido (mais limpo).
  const [open, setOpen] = useState(seasons.length <= 4);
  const cur = seasons[seasonIdx];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
      >
        <TvMinimalPlay className="h-4 w-4 shrink-0 text-fuchsia-400" />
        <span className="max-w-[240px] truncate">{cur?.name ?? "Temporadas"}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {seasons.length} temporadas
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <AudioPrefToggle compact />
      {open ? (
        <div
          className="flex w-full flex-1 gap-2 overflow-x-auto pb-1 no-scrollbar"
          role="tablist"
        >
          {seasons.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === seasonIdx}
              onClick={() => onSelect(i)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                i === seasonIdx
                  ? "bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-950/40"
                  : "border border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {s.name}
              {s.audioType ? (
                <span className="ml-2 text-[10px] opacity-70">{s.audioType}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EpisodeGroups({
  count,
  targetIndex,
  renderItem,
}: {
  count: number;
  targetIndex: number;
  renderItem: (start: number, end: number) => React.ReactNode;
}) {
  // Abre o grupo do episódio em andamento; senão o primeiro (EP 1).
  const [openGroup, setOpenGroup] = useState<number | null>(
    groupOfIndex(targetIndex, EP_GROUP_SIZE, 0),
  );

  return (
    <RangeAccordion
      count={count}
      size={EP_GROUP_SIZE}
      openIndex={openGroup}
      onOpenChange={setOpenGroup}
      unit="eps"
      labelFor={(s, e) => `Episódios ${s + 1} – ${e}`}
      renderItem={renderItem}
    />
  );
}

export function AnimeEpisodeList({
  episodes,
  seasonIdx,
  inProgressIdx,
  playingEpId,
  anizip,
  entryFor,
  onSelectEpisode,
  showCompactAudioPref,
}: {
  episodes: EpisodeInfo[];
  seasonIdx: number;
  inProgressIdx: number;
  playingEpId: string | null;
  anizip: AniZipMapping | null;
  entryFor: (epId: string) => WatchEntry | null;
  onSelectEpisode: (ep: EpisodeInfo) => void;
  showCompactAudioPref: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">
          Episódios{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({episodes.length})
          </span>
        </h2>
        {showCompactAudioPref ? (
          <AudioPrefToggle compact className="md:hidden" />
        ) : null}
      </div>
      {episodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum episódio disponível nesta temporada.
        </p>
      ) : (
        <EpisodeGroups
          key={seasonIdx}
          count={episodes.length}
          targetIndex={inProgressIdx}
          renderItem={(s, e) => (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {episodes.slice(s, e).map((ep) => {
                const n = epNumFromTitle(ep.title) ?? ep.episodeNumber ?? null;
                const zipT = zipTitlePtBr(anizip, n);
                const thumb =
                  ep.thumbnailLarge || zipEpisode(anizip, n)?.image || null;
                const entry = entryFor(ep.id);
                const pct = entry ? watchPercent(entry) : null;
                const watched = entry ? isWatched(entry) : false;
                return (
                  <button
                    key={ep.id}
                    onClick={() => onSelectEpisode(ep)}
                    className={cn(
                      "group flex gap-3 rounded-xl border p-2 text-left transition-all hover:border-fuchsia-500/60 hover:bg-secondary/50",
                      playingEpId === ep.id
                        ? "border-fuchsia-500/60 bg-secondary/50"
                        : "border-border/60",
                    )}
                  >
                    <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-zinc-800 sm:w-40">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-7 w-7 text-white" fill="white" />
                      </span>
                      {ep.isNew ? (
                        <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 text-[9px] font-bold text-black">
                          NOVO
                        </span>
                      ) : null}
                      {watched ? (
                        <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-emerald-600/90 px-1 py-0.5 text-[9px] font-bold text-white">
                          <CheckCircle2 className="h-2.5 w-2.5" /> ASSISTIDO
                        </span>
                      ) : pct != null && pct > 0 ? (
                        <span className="absolute right-1 top-1 rounded bg-fuchsia-600/90 px-1 py-0.5 text-[9px] font-bold text-white">
                          {pct}%
                        </span>
                      ) : null}
                      {pct != null && pct > 0 && !watched ? (
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
                          <div
                            className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 py-1">
                      <p className="text-xs font-semibold text-fuchsia-400">
                        EP {n ?? "?"}
                      </p>
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {zipT || ep.title || "Episódio"}
                      </p>
                      {zipT && ep.title ? (
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground/70">
                          {ep.title}
                        </p>
                      ) : null}
                      {ep.audioType ? (
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {ep.audioType}
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        />
      )}
    </section>
  );
}
