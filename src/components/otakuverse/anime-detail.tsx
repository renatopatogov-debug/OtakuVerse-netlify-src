"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Globe,
  Languages,
  Loader2,
  Sparkles,
  Star,
  Youtube,
} from "lucide-react";
import { fetchJson, useAsync } from "./use-async";
import { AudioBadges, GENRE_PT, Poster } from "./cards";
import { TrailerDialog } from "./hero";
import {
  AudioPrefToggle,
  FavButton,
  ResumeChip,
  normalizeAudio,
  pickByAudioPref,
} from "./library";
import {
  epNumFromTitle,
  type EnrichResult,
  type SfhdMatchItem,
} from "./anime-detail-helpers";
import { AnimeEpisodeList, SeasonPicker } from "./anime-episodes";
import {
  AnimePlayerPanel,
  type PlayerMode,
  type VideoQuality,
} from "./anime-player-panel";
import { AnimeRecs } from "./anime-recs";
import type { Nav } from "./types";
import type { AnimeCatalogDetail, EpisodeInfo } from "@/lib/otakulogia";
import type { TomatoMatchItem } from "@/lib/tomato";
import {
  type AudioPref,
  isWatched,
  usePreferredAudio,
  useWatchHistory,
  watchPercent,
} from "@/lib/local-store";

/* ---------- Corpo enriquecido (recebe o detail já carregado) ---------- */

function AnimeDetailContent({
  detail,
  nav,
  epId,
}: {
  detail: AnimeCatalogDetail;
  nav: Nav;
  epId?: string;
}) {
  const anime = detail.anime;
  const seasons = detail.seasons;

  const enrich = useAsync<EnrichResult>(
    (signal) =>
      fetchJson<EnrichResult>(
        `/api/anilist/enrich?name=${encodeURIComponent(anime.name)}${
          anime.nameEn ? `&nameEn=${encodeURIComponent(anime.nameEn)}` : ""
        }`,
        { signal },
      ),
    `enrich:${anime.upstreamCid}`,
  );
  const media = enrich.data?.media ?? null;
  const anizip = enrich.data?.anizip ?? null;
  const malId = media?.idMal ?? null;

  const [audioPref] = usePreferredAudio();
  const [manualSeason, setManualSeason] = useState<{
    pref: AudioPref;
    idx: number;
  } | null>(null);

  // Descobre a temporada dona do `epId` caso venha de deep-link ou Continuar Assistindo
  const epSeasonIdx = useMemo(() => {
    if (!epId || seasons.length <= 1) return -1;
    const targetEp = detail.episodes.find((e) => e.id === epId);
    if (!targetEp || targetEp.upstreamTempId == null) return -1;
    return seasons.findIndex((s) => s.upstreamTid === targetEp.upstreamTempId);
  }, [epId, detail.episodes, seasons]);

  const preferredSeasonIdx = useMemo(() => {
    if (epSeasonIdx >= 0) return epSeasonIdx;
    if (!audioPref) return 0;
    const idx = seasons.findIndex((s) => normalizeAudio(s.audioType) === audioPref);
    return idx >= 0 ? idx : 0;
  }, [epSeasonIdx, audioPref, seasons]);

  const seasonIdx =
    manualSeason && manualSeason.pref === audioPref
      ? manualSeason.idx
      : preferredSeasonIdx;

  // Calcula o número real da temporada (ignorando duplicação por áudio LEG/DUB)
  const { seasonNumber, effectiveAudioPref } = useMemo(() => {
    const activeSeason = seasons[seasonIdx];
    const seasonAud = normalizeAudio(activeSeason?.audioType) ?? audioPref;
    if (!activeSeason) {
      return { seasonNumber: 1, effectiveAudioPref: seasonAud };
    }
    const m = activeSeason.name.match(
      /(?:temporada|season|\btemp\.?|\bs)\s*(\d+)|(\d+)[ªº]?\s*(?:temporada|season)/i,
    );
    const parsedNum = Number(m?.[1] || m?.[2] || 0);
    if (parsedNum > 0) {
      return { seasonNumber: parsedNum, effectiveAudioPref: seasonAud };
    }
    const activeNorm = normalizeAudio(activeSeason.audioType);
    let rank = 0;
    for (let i = 0; i <= seasonIdx && i < seasons.length; i++) {
      if (normalizeAudio(seasons[i].audioType) === activeNorm) {
        rank++;
      }
    }
    return {
      seasonNumber: Math.max(1, rank),
      effectiveAudioPref: seasonAud,
    };
  }, [seasons, seasonIdx, audioPref]);

  const [epSelection, setEpSelection] = useState<
    | { kind: "picked"; ep: EpisodeInfo; startAt: number }
    | { kind: "cleared" }
    | null
  >(null);
  const [playerControl, setPlayerControl] = useState<{
    epId: string;
    mode: PlayerMode;
    quality: VideoQuality;
  }>({ epId: "", mode: "primary", quality: "HD" });
  const [trailerOpen, setTrailerOpen] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  /* ----- Biblioteca local (progresso + favoritos + áudio preferido) ----- */
  const { entries: historyEntries } = useWatchHistory();
  const olEntryFor = useCallback(
    (epKey: string) =>
      historyEntries.find(
        (e) =>
          e.key === `ol:${detail.anime.upstreamCid}:${epKey}` ||
          ((e.source === "tomato" || e.source === "sfhd") &&
            e.cid === detail.anime.upstreamCid &&
            e.episodeId === epKey),
      ) ?? null,
    [historyEntries, detail.anime.upstreamCid],
  );
  const lastWatched = useMemo(
    () =>
      historyEntries.find(
        (e) =>
          e.key.startsWith(`ol:${detail.anime.upstreamCid}:`) ||
          ((e.source === "tomato" || e.source === "sfhd") &&
            e.cid === detail.anime.upstreamCid),
      ) ?? null,
    [historyEntries, detail.anime.upstreamCid],
  );

  const episodes = useMemo(() => {
    const season = seasons[seasonIdx];
    let eps = detail.episodes;
    if (season) {
      const filtered = eps.filter(
        (e) => e.upstreamTempId === season.upstreamTid,
      );
      if (filtered.length > 0) eps = filtered;
    }
    const numOf = (e: EpisodeInfo): number =>
      epNumFromTitle(e.title) ?? e.episodeNumber ?? 999999;
    return [...eps].sort((a, b) => numOf(a) - numOf(b));
  }, [detail, seasonIdx, seasons]);

  const inProgressIdx = episodes.findIndex((ep) => {
    const entry = olEntryFor(ep.id);
    return entry != null && !isWatched(entry) && (watchPercent(entry) ?? 0) > 0;
  });

  const playing = useMemo<{ ep: EpisodeInfo; startAt: number } | null>(() => {
    if (epSelection?.kind === "cleared") return null;
    if (epSelection?.kind === "picked") {
      return { ep: epSelection.ep, startAt: epSelection.startAt };
    }
    if (!epId) return null;
    const ep =
      episodes.find((e) => e.id === epId) ??
      detail.episodes.find((e) => e.id === epId);
    if (!ep) return null;
    const entry = olEntryFor(epId);
    return {
      ep,
      startAt: entry && !isWatched(entry) ? entry.position : 0,
    };
  }, [epSelection, epId, episodes, detail.episodes, olEntryFor]);

  const activeQuality: VideoQuality =
    playing && playerControl.epId === playing.ep.id
      ? playerControl.quality
      : "HD";
  const activeMode: PlayerMode =
    playing && playerControl.epId === playing.ep.id
      ? playerControl.mode
      : "primary";

  /* ----- Pontes alternativas (animesfhd + Tomato) ----- */
  const matchTitle = anime.nameEn || anime.name;
  const sfhdMatch = useAsync<{ matches: SfhdMatchItem[] }>(
    (signal) =>
      malId && matchTitle
        ? fetchJson(
            `/api/anime/sfhd-match?title=${encodeURIComponent(matchTitle)}&mal=${malId}`,
            { signal },
          )
        : Promise.resolve({ matches: [] }),
    malId && matchTitle ? `sfhd-match:${malId}` : "sfhd-match:none",
  );
  const sfhdPick = pickByAudioPref(sfhdMatch.data?.matches ?? [], audioPref);
  const sfhdOther =
    sfhdMatch.data?.matches.find((m) => m.seriesId !== sfhdPick?.seriesId) ??
    null;

  const tomatoMatch = useAsync<{ matches: TomatoMatchItem[] }>(
    (signal) =>
      matchTitle
        ? fetchJson<{ matches: TomatoMatchItem[] }>(
            `/api/anime/tomato-match?title=${encodeURIComponent(matchTitle)}&audio=${audioPref || ""}`,
            { signal },
          )
        : Promise.resolve({ matches: [] }),
    matchTitle
      ? `tomato-match:${matchTitle}:${audioPref}`
      : "tomato-match:none",
  );
  const tomatoPick = tomatoMatch.data?.matches?.[0] ?? null;

  const scrollToPlayer = () => {
    requestAnimationFrame(() =>
      playerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho — banner HD do AniList quando disponível */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60">
        <div className="absolute inset-0">
          {media?.bannerImage ? (
            <img
              src={media.bannerImage}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Poster
              src={anime.posterUrl}
              alt=""
              icon="anime"
              className="h-full w-full scale-110 opacity-25 blur-lg"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/30" />
          {media?.bannerImage ? (
            <div className="absolute inset-0 bg-gradient-to-r from-background/70 to-transparent" />
          ) : null}
        </div>
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row md:p-8">
          <div className="w-32 shrink-0 self-start overflow-hidden rounded-xl shadow-2xl sm:w-40 md:w-48">
            <Poster
              src={media?.coverImage?.extraLarge || anime.posterUrl}
              alt={anime.name}
              icon="anime"
              className="aspect-[2/3] h-auto w-full"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold leading-tight md:text-4xl">
              {anime.name}
            </h1>
            {anime.nameEn && anime.nameEn !== anime.name ? (
              <p className="mt-1 text-sm text-muted-foreground">{anime.nameEn}</p>
            ) : null}
            {enrich.data?.titlePtBr &&
            enrich.data.titlePtBr !== anime.name &&
            enrich.data.titlePtBr !== anime.nameEn ? (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                <Languages className="h-3 w-3" />
                {enrich.data.titlePtBr}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {media?.averageScore ? (
                <span className="inline-flex items-center gap-1 rounded bg-amber-950/70 px-2 py-1 font-bold text-amber-400">
                  <Star className="h-3.5 w-3.5" fill="currentColor" />
                  {(media.averageScore / 10).toFixed(1)}
                  <span className="text-[10px] font-medium text-amber-200/70">
                    AniList
                  </span>
                </span>
              ) : null}
              {anime.year ? (
                <span className="rounded bg-secondary px-2 py-1 font-medium">
                  {anime.year}
                </span>
              ) : null}
              {anime.status ? (
                <span className="rounded bg-secondary px-2 py-1 font-medium">
                  {anime.status}
                </span>
              ) : null}
              <AudioBadges audioMix={anime.audioMix} />
              {anime.hasNewEpisode ? (
                <span className="animate-pulse rounded bg-amber-500 px-2 py-1 font-bold text-black">
                  NOVO EP
                </span>
              ) : null}
            </div>

            {media?.genres?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {media.genres.slice(0, 6).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-fuchsia-500/30 bg-fuchsia-950/30 px-2.5 py-0.5 text-[11px] font-medium text-fuchsia-200"
                  >
                    {GENRE_PT[g] ?? g}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>
                <strong className="text-foreground">{detail.seasons.length}</strong>{" "}
                temporadas
              </span>
              <span>
                <strong className="text-foreground">{detail.episodes.length}</strong>{" "}
                episódios
              </span>
              {media?.trailer?.site === "youtube" ? (
                <button
                  onClick={() => setTrailerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black/60"
                >
                  <Youtube className="h-4 w-4 text-red-500" />
                  Trailer
                </button>
              ) : null}
              <FavButton
                entry={{
                  key: `ol:${anime.upstreamCid}`,
                  kind: "anime",
                  title: anime.name,
                  posterUrl: media?.coverImage?.extraLarge || anime.posterUrl || null,
                  cid: anime.upstreamCid,
                  audioMix: anime.audioMix ?? null,
                  year: anime.year ?? null,
                }}
              />
            </div>
            {lastWatched && lastWatched.episodeId && !playing ? (
              <div className="mt-3">
                <ResumeChip
                  entry={lastWatched}
                  onResume={() => {
                    const ep =
                      episodes.find((e) => e.id === lastWatched.episodeId) ??
                      detail.episodes.find((e) => e.id === lastWatched.episodeId);
                    if (ep) {
                      if (ep.upstreamTempId != null && seasons.length > 1) {
                        const targetIdx = seasons.findIndex(
                          (s) => s.upstreamTid === ep.upstreamTempId,
                        );
                        if (targetIdx >= 0 && targetIdx !== seasonIdx) {
                          setManualSeason({ pref: audioPref, idx: targetIdx });
                        }
                      }
                      const resumeAt = isWatched(lastWatched)
                        ? 0
                        : lastWatched.position;
                      setEpSelection({ kind: "picked", ep, startAt: resumeAt });
                      setPlayerControl({
                        epId: ep.id,
                        mode: "primary",
                        quality: "HD",
                      });
                      nav.replaceCurrent({
                        t: "anime-detail",
                        cid: anime.upstreamCid,
                        epId: ep.id,
                      });
                      scrollToPlayer();
                    }
                  }}
                />
              </div>
            ) : null}
            {anime.synopsis || media?.description ? (
              <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {anime.synopsis || media?.description}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <TrailerDialog
        media={trailerOpen ? media : null}
        onClose={() => setTrailerOpen(false)}
      />

      {/* Player */}
      <div ref={playerRef} id="player">
        {playing ? (
          <AnimePlayerPanel
            anime={anime}
            ep={playing.ep}
            startAt={playing.startAt}
            seasonNumber={seasonNumber}
            quality={activeQuality}
            mode={activeMode}
            media={media}
            anizip={anizip}
            audioPref={effectiveAudioPref}
            sfhdPick={sfhdPick}
            tomatoPick={tomatoPick}
            onQualityChange={(q) =>
              setPlayerControl({
                epId: playing.ep.id,
                mode: "primary",
                quality: q,
              })
            }
            onModeChange={(m) =>
              setPlayerControl({
                epId: playing.ep.id,
                mode: m,
                quality: activeQuality,
              })
            }
          />
        ) : null}
      </div>

      {/* Temporadas + preferência de áudio */}
      {seasons.length > 1 ? (
        <SeasonPicker
          seasons={seasons}
          seasonIdx={seasonIdx}
          onSelect={(i) => {
            setManualSeason({ pref: audioPref, idx: i });
            setEpSelection({ kind: "cleared" });
            nav.replaceCurrent({ t: "anime-detail", cid: anime.upstreamCid });
          }}
        />
      ) : (
        <div className="flex items-center gap-3">
          <AudioPrefToggle compact />
          <span className="text-[11px] text-muted-foreground">
            preferência usada para escolher temporadas e a fonte HLS
          </span>
        </div>
      )}

      {/* Episódios */}
      <AnimeEpisodeList
        episodes={episodes}
        seasonIdx={seasonIdx}
        inProgressIdx={inProgressIdx}
        playingEpId={playing?.ep.id ?? null}
        anizip={anizip}
        entryFor={olEntryFor}
        showCompactAudioPref={seasons.length <= 1}
        onSelectEpisode={(ep) => {
          const saved = olEntryFor(ep.id);
          const resumeAt = saved && !isWatched(saved) ? saved.position : 0;
          setEpSelection({ kind: "picked", ep, startAt: resumeAt });
          setPlayerControl({ epId: ep.id, mode: "primary", quality: "HD" });
          nav.replaceCurrent({
            t: "anime-detail",
            cid: anime.upstreamCid,
            epId: ep.id,
          });
          scrollToPlayer();
        }}
      />

      {/* Fonte HLS alternativa (animesfhd) casada pelo MAL id — leg/dub */}
      {malId && sfhdPick ? (
        <section className="rounded-2xl border border-sky-500/25 bg-sky-950/10 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60">
                <Poster
                  src={sfhdPick.coverUrl}
                  alt={sfhdPick.title}
                  icon="anime"
                  className="h-full w-full"
                />
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  <Globe className="h-4 w-4 text-sky-400" />
                  Também em animesfhd.net
                  <span className="rounded bg-sky-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    HLS
                  </span>
                  {sfhdMatch.data && sfhdMatch.data.matches.length > 1 ? (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                      {sfhdMatch.data.matches.length} versões
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {sfhdPick.episodeCount} episódios em streaming HLS (
                  {sfhdPick.category === "dublado" ? "dublado" : "legendado"}) ·
                  casamento verificado pelo MAL id {malId}
                  {audioPref &&
                  sfhdPick.category &&
                  normalizeAudio(sfhdPick.category) !== audioPref ? (
                    <span className="text-amber-400">
                      {" "}
                      · versão {audioPref === "dub" ? "dublada" : "legendada"} não
                      encontrada nesta fonte
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {sfhdOther ? (
                <button
                  onClick={() =>
                    nav.push({
                      t: "sfhd-detail",
                      seriesId: sfhdOther.seriesId,
                    })
                  }
                  className="rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  title={`Versão ${sfhdOther.category === "dublado" ? "dublada" : "legendada"} no animesfhd`}
                >
                  Ver {sfhdOther.category === "dublado" ? "dublado" : "legendado"}
                </button>
              ) : null}
              <button
                onClick={() =>
                  nav.push({
                    t: "sfhd-detail",
                    seriesId: sfhdPick.seriesId,
                  })
                }
                className="rounded-lg border border-sky-500/50 bg-sky-950/40 px-4 py-2 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-950/70"
              >
                Abrir fonte HLS
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Fonte Tomato (1080p FHD) alternativa */}
      {tomatoPick ? (
        <section className="rounded-2xl border border-rose-500/25 bg-rose-950/10 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60">
                <Poster
                  src={tomatoPick.coverUrl || anime.posterUrl}
                  alt={tomatoPick.name}
                  icon="anime"
                  className="h-full w-full"
                />
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-rose-400" />
                  Também disponível no Tomato
                  <span className="rounded bg-rose-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    1080p FHD
                  </span>
                  {tomatoPick.seasons.length > 1 ? (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                      {tomatoPick.seasons.length} temporadas/versões
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {tomatoPick.episodeCount} episódios em qualidade 1080p FHD ·{" "}
                  {tomatoPick.seasons.some((s) => s.dubbed)
                    ? "Dublado e Legendado"
                    : "Legendado"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                onClick={() => {
                  const targetEp = playing?.ep ?? episodes[0];
                  if (!targetEp) return;
                  if (!playing || playing.ep.id !== targetEp.id) {
                    setEpSelection({ kind: "picked", ep: targetEp, startAt: 0 });
                  }
                  setPlayerControl({
                    epId: targetEp.id,
                    mode: "tomato",
                    quality: activeQuality,
                  });
                  scrollToPlayer();
                }}
                className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-4 py-2 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-950/70"
              >
                Assistir no Tomato
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <AnimeRecs
        name={anime.name}
        nameEn={anime.nameEn ?? null}
        nav={nav}
      />
    </div>
  );
}

/* ---------- Wrapper: carrega o detail e monta o conteúdo ---------- */

export function AnimeDetail({
  cid,
  nav,
  epId,
}: {
  cid: number;
  nav: Nav;
  epId?: string;
}) {
  const { data, loading, error } = useAsync<AnimeCatalogDetail>(
    (signal) => fetchJson(`/api/anime/detail?cid=${cid}`, { signal }),
    `anime-detail:${cid}`,
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm">Não foi possível carregar: {error}</p>
        <button
          onClick={nav.back}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
        >
          Voltar
        </button>
      </div>
    );
  }

  return <AnimeDetailContent detail={data} nav={nav} epId={epId} />;
}
