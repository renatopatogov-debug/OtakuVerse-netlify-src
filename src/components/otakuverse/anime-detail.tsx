"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Globe,
  Languages,
  Loader2,
  Play,
  SkipForward,
  Star,
  TvMinimalPlay,
  Youtube,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fetchJson, useAsync } from "./use-async";
import { RangeAccordion, groupOfIndex } from "./collapsible-groups";
import { AudioBadges, GENRE_PT, Poster } from "./cards";
import { TrailerDialog } from "./hero";
import { HlsPlayer, type PlayerSource } from "./hls-player";
import {
  AudioPrefToggle,
  FavButton,
  ResumeChip,
  normalizeAudio,
  pickByAudioPref,
} from "./library";
import type { Nav } from "./types";
import type { AnimeCatalogDetail, EpisodeInfo, SeasonInfo } from "@/lib/otakulogia";
import type { AniListMedia } from "@/lib/anilist";
import type { AniZipMapping, AniZipEpisode } from "@/lib/anizip";
import type { SkipTimes } from "@/lib/aniskip";
import type { SfhdSourcesResult } from "@/lib/animesfhd";
import {
  isWatched,
  saveWatchProgress,
  usePreferredAudio,
  useProgressSaver,
  useWatchHistory,
  watchPercent,
} from "@/lib/local-store";
import { cn } from "@/lib/utils";

// Extrai o nº do episódio do título, priorizando padrões "EP. 04" e "Episódio 4"
function epNumFromTitle(title?: string | null): number | null {
  if (!title) return null;
  const patterns = [
    /EP\.?\s*(\d{1,4})/i,
    /Epis[óo]dio\s*(\d{1,4})/i,
    /#\s*(\d{1,4})/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

interface EnrichResult {
  media: AniListMedia | null;
  anizip: AniZipMapping | null;
  titlePtBr: string | null;
}

function zipEpisode(
  anizip: AniZipMapping | null,
  n: number | null,
): AniZipEpisode | null {
  if (!anizip?.episodes || !n) return null;
  return anizip.episodes[String(n)] ?? null;
}

function zipTitlePtBr(anizip: AniZipMapping | null, n: number | null): string | null {
  const info = zipEpisode(anizip, n);
  if (!info?.title) return null;
  return (
    info.title["pt-BR"] ?? info.title["pt"] ?? info.title["en"] ??
    info.title["x-jat"] ?? null
  );
}

interface SfhdMatchItem {
  seriesId: string;
  title: string;
  coverUrl: string | null;
  episodeCount: number;
  category: string | null;
}

/* Estado do fallback HLS (animesfhd) dentro do player primário */
type FallbackState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: SfhdSourcesResult; seriesId: string }
  | { status: "error"; message: string };

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

  const enrich = useAsync<EnrichResult>(
    () =>
      fetchJson<EnrichResult>(
        `/api/anilist/enrich?name=${encodeURIComponent(anime.name)}${
          anime.nameEn ? `&nameEn=${encodeURIComponent(anime.nameEn)}` : ""
        }`,
      ),
    `enrich:${anime.upstreamCid}`,
  );
  const media = enrich.data?.media ?? null;
  const anizip = enrich.data?.anizip ?? null;

  const [seasonIdx, setSeasonIdx] = useState(0);
  const [playing, setPlaying] = useState<{
    ep: AnimeCatalogDetail["episodes"][number];
  } | null>(null);
  const [quality, setQuality] = useState<"SD" | "HD" | "FHD">("HD");
  const [trailerOpen, setTrailerOpen] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumedRef = useRef(false);
  const pendingSeekRef = useRef(0);

  /* ----- Biblioteca local (progresso + favoritos + áudio preferido) ----- */
  const [audioPref] = usePreferredAudio();
  const saveProgress = useProgressSaver(5);
  const { entries: historyEntries } = useWatchHistory();
  const olEntryFor = useCallback(
    (epKey: string) =>
      historyEntries.find((e) => e.key === `ol:${detail.anime.upstreamCid}:${epKey}`) ?? null,
    [historyEntries, detail.anime.upstreamCid],
  );
  // Último episódio assistido deste anime (para o chip "Continuar")
  const lastWatched = useMemo(
    () =>
      historyEntries.find(
        (e) => e.key.startsWith(`ol:${detail.anime.upstreamCid}:`),
      ) ?? null,
    [historyEntries, detail.anime.upstreamCid],
  );
  // Episódios já assistidos (check) e em progresso (mini barra)
  const watchedIds = useMemo(
    () =>
      new Set(
        historyEntries
          .filter(
            (e) =>
              e.key.startsWith(`ol:${detail.anime.upstreamCid}:`) &&
              e.episodeId &&
              isWatched(e),
          )
          .map((e) => e.episodeId),
      ),
    [historyEntries, detail.anime.upstreamCid],
  );

  const seasons = detail.seasons;

  /* Auto-seleciona a temporada com o áudio preferido (LEG/DUB) quando existir */
  useEffect(() => {
    if (!audioPref) return;
    const idx = seasons.findIndex((s) => normalizeAudio(s.audioType) === audioPref);
    if (idx >= 0) {
      setSeasonIdx((cur) => (cur === idx ? cur : idx));
    }
  }, [audioPref, seasons]);

  const episodes = useMemo(() => {
    const season = seasons[seasonIdx];
    let eps = detail.episodes;
    if (season) {
      const filtered = eps.filter(
        (e) => e.upstreamTempId === season.upstreamTid,
      );
      if (filtered.length > 0) eps = filtered;
    }
    // Número real do episódio vem do título ("Episódio 12", "T07 EP. 144 - ...");
    // episodeNumber do upstream costuma ser o total de eps da temporada.
    const numOf = (e: EpisodeInfo): number =>
      epNumFromTitle(e.title) ?? e.episodeNumber ?? 999999;
    return [...eps].sort((a, b) => numOf(a) - numOf(b));
  }, [detail, seasonIdx, seasons]);

  // Episódio em andamento (para abrir o grupo certo da lista retrátil)
  const inProgressIdx = episodes.findIndex((ep) => {
    const entry = olEntryFor(ep.id);
    return entry != null && !isWatched(entry) && (watchPercent(entry) ?? 0) > 0;
  });

  /* ----- Skip times (AniSkip) ----- */
  // Estado com key derivada: enquanto a key não bate, sem skip (sem setState
  // síncrono no effect — compatível com react-hooks v6).
  const [skipState, setSkipState] = useState<{
    key: string;
    skip: SkipTimes | null;
  }>({ key: "", skip: null });
  const [skipBtnState, setSkipBtnState] = useState<{
    key: string;
    label: string;
    to: number;
  } | null>(null);

  const playingEpNum = playing
    ? (epNumFromTitle(playing.ep.title) ?? playing.ep.episodeNumber ?? null)
    : null;
  const malId = media?.idMal ?? null;
  const skipKey =
    playing && malId && playingEpNum
      ? `${playing.ep.id}:${malId}:${playingEpNum}`
      : "";
  const lengthMin = zipEpisode(anizip, playingEpNum)?.length ?? null;

  useEffect(() => {
    if (!skipKey) return;
    let alive = true;
    const [, malIdStr, epStr] = skipKey.split(":");
    const lenParam = lengthMin ? `&length=${lengthMin * 60}` : "";
    fetchJson<{ skip: SkipTimes | null }>(
      `/api/skip-times?malId=${malIdStr}&ep=${epStr}${lenParam}`,
    )
      .then((r) => {
        if (alive) setSkipState({ key: skipKey, skip: r.skip ?? null });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [skipKey]);

  const skip = skipState.key === skipKey ? skipState.skip : null;

  /* ----- Progresso local (Continuar Assistindo) ----- */
  const olEntry = playing
    ? {
        key: `ol:${anime.upstreamCid}:${playing.ep.id}`,
        source: "otakulogia" as const,
        title: anime.name,
        posterUrl: media?.coverImage?.extraLarge || anime.posterUrl || null,
        thumbUrl: playing.ep.thumbnailLarge || null,
        cid: anime.upstreamCid,
        episodeId: playing.ep.id,
        episodeNumber: playingEpNum,
        episodeTitle: zipTitlePtBr(anizip, playingEpNum) ?? playing.ep.title ?? null,
        audio:
          normalizeAudio(playing.ep.audioType) === "dub"
            ? ("dublado" as const)
            : ("legendado" as const),
      }
    : null;

  const onTimeUpdate = () => {
    const v = videoRef.current;
    const t = v?.currentTime ?? 0;
    let next: { label: string; to: number } | null = null;
    if (skip) {
      if (skip.op && t >= skip.op.startTime && t < skip.op.endTime - 2) {
        next = { label: "Pular abertura", to: skip.op.endTime };
      } else if (
        skip.ed &&
        t >= skip.ed.startTime &&
        t < skip.ed.endTime - 2
      ) {
        next = { label: "Pular encerramento", to: skip.ed.endTime };
      }
    }
    setSkipBtnState((prev) => {
      const same =
        prev &&
        prev.key === skipKey &&
        prev.label === next?.label &&
        prev.to === next?.to;
      if (same) return prev;
      return next ? { key: skipKey, label: next.label, to: next.to } : null;
    });
    // Salva o progresso no navegador (throttle interno de 5s)
    if (v && olEntry && v.duration > 0 && Number.isFinite(v.duration)) {
      saveProgress(olEntry, t, v.duration);
    }
  };

  const onVideoEnded = () => {
    if (!olEntry) return;
    const v = videoRef.current;
    const dur =
      v?.duration && Number.isFinite(v.duration) ? Math.floor(v.duration) : 1;
    saveWatchProgress({ ...olEntry, position: dur, duration: dur });
  };
  const skipBtn =
    skipBtnState && skipBtnState.key === skipKey
      ? { label: skipBtnState.label, to: skipBtnState.to }
      : null;

  const urlFor = (ep: EpisodeInfo) =>
    quality === "FHD"
      ? ep.videoUrlFhd || ep.videoUrl
      : quality === "SD"
        ? ep.videoUrlSd || ep.videoUrl
        : ep.videoUrl;

  /* ----- Retomada: deep-link do histórico (Continuar Assistindo) ----- */
  useEffect(() => {
    if (resumedRef.current || !epId || episodes.length === 0) return;
    const ep = episodes.find((e) => e.id === epId);
    if (ep) {
      resumedRef.current = true;
      // Retoma do segundo salvo no histórico (se ainda existir)
      const entry = historyEntries.find(
        (e) => e.key === `ol:${anime.upstreamCid}:${epId}`,
      );
      pendingSeekRef.current = entry && !isWatched(entry) ? entry.position : 0;
      setPlaying({ ep });
    }
  }, [epId, episodes, historyEntries, anime.upstreamCid]);

  /* ----- Ponte MAL → animesfhd (fonte HLS alternativa) ----- */
  // O enrich já traz o idMal; a API do animesfhd expõe mal.id nas séries.
  // Casamos por título e validamos pelo MAL id — match sem falso positivo.
  // Devolve TODAS as versões validadas (legendada e dublada são séries
  // distintas) e escolhemos pela preferência de áudio.
  const matchTitle = anime.nameEn || anime.name;
  const sfhdMatch = useAsync<{ matches: SfhdMatchItem[] }>(
    () =>
      malId && matchTitle
        ? fetchJson(
            `/api/anime/sfhd-match?title=${encodeURIComponent(matchTitle)}&mal=${malId}`,
          )
        : Promise.resolve({ matches: [] }),
    malId && matchTitle ? `sfhd-match:${malId}` : "sfhd-match:none",
  );
  const sfhdPick = pickByAudioPref(sfhdMatch.data?.matches ?? [], audioPref);
  const sfhdOther =
    sfhdMatch.data?.matches.find((m) => m.seriesId !== sfhdPick?.seriesId) ?? null;

  /* ----- Fallback HLS dentro do player (quando o MP4 primário falha) ----- */
  const [fallback, setFallback] = useState<FallbackState>({ status: "idle" });
  const [fallbackWanted, setFallbackWanted] = useState(false);
  const [primaryFailed, setPrimaryFailed] = useState(false);

  useEffect(() => {
    // Trocou de episódio/qualidade → reseta o fallback
    setFallback({ status: "idle" });
    setFallbackWanted(false);
    setPrimaryFailed(false);
  }, [playing?.ep.id, quality]);

  useEffect(() => {
    if (!fallbackWanted || !sfhdPick || !playingEpNum) return;
    let alive = true;
    (async () => {
      setFallback({ status: "loading" });
      try {
        const det = await fetchJson<{ episodes: { id: string; number: number }[] }>(
          `/api/anime/sfhd-detail?seriesId=${encodeURIComponent(sfhdPick.seriesId)}`,
        );
        // Número exato; senão um a menos (séries dubladas costumam atrasar 1 ep)
        const ep =
          det.episodes.find((e) => e.number === playingEpNum) ??
          det.episodes.find((e) => e.number === playingEpNum - 1) ??
          det.episodes[0];
        if (!ep) throw new Error("Episódio não existe na fonte HLS");
        const src = await fetchJson<SfhdSourcesResult>(
          `/api/anime/sfhd-source?episodeId=${encodeURIComponent(ep.id)}`,
        );
        if (!src?.sources?.length) throw new Error("Sem fontes HLS agora");
        if (alive) {
          setFallback({ status: "ready", data: src, seriesId: sfhdPick.seriesId });
        }
      } catch (e) {
        if (alive) {
          setFallback({
            status: "error",
            message: e instanceof Error ? e.message : "Falha ao resolver HLS",
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [fallbackWanted, sfhdPick, playingEpNum]);

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
                    const ep = episodes.find(
                      (e) => e.id === lastWatched.episodeId,
                    );
                    if (ep) {
                      pendingSeekRef.current = isWatched(lastWatched)
                        ? 0
                        : lastWatched.position;
                      setPlaying({ ep });
                      requestAnimationFrame(() =>
                        playerRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        }),
                      );
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

      <TrailerDialog media={trailerOpen ? media : null} onClose={() => setTrailerOpen(false)} />

      {/* Player */}
      <div ref={playerRef} id="player">
        {playing ? (
          <div className="overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-black shadow-2xl shadow-fuchsia-950/30">
            {fallback.status === "ready" ? (
              /* Fallback HLS (animesfhd) ativo — player HLS com failover */
              <div className="space-y-2 px-2 pt-2 sm:px-3 sm:pt-3">
                <HlsPlayer
                  key={`sfhd-fb-${fallback.data.episodeId}`}
                  sources={fallback.data.sources}
                  subtitleVttUrl={fallback.data.subtitleVttUrl}
                  title={`${anime.name} ep ${fallback.data.episodeNumber || playingEpNum || ""}`}
                  poster={
                    playing.ep.thumbnailLarge ||
                    zipEpisode(anizip, playingEpNum)?.image ||
                    null
                  }
                  onProgress={(p, d) => {
                    if (!sfhdPick) return;
                    saveProgress(
                      {
                        key: `sfhd:${fallback.seriesId}:${fallback.data.episodeId}`,
                        source: "sfhd",
                        title: anime.name,
                        posterUrl:
                          media?.coverImage?.extraLarge || anime.posterUrl || null,
                        cid: anime.upstreamCid,
                        seriesId: fallback.seriesId,
                        episodeId: fallback.data.episodeId,
                        episodeNumber:
                          fallback.data.episodeNumber || playingEpNum,
                        episodeTitle:
                          zipTitlePtBr(anizip, playingEpNum) ?? playing.ep.title ?? null,
                        audio:
                          normalizeAudio(sfhdPick.category) === "dub"
                            ? ("dublado" as const)
                            : ("legendado" as const),
                      },
                      p,
                      d,
                    );
                  }}
                  onEnded={() => {
                    if (!sfhdPick) return;
                    saveWatchProgress({
                      key: `sfhd:${fallback.seriesId}:${fallback.data.episodeId}`,
                      source: "sfhd",
                      title: anime.name,
                      posterUrl:
                        media?.coverImage?.extraLarge || anime.posterUrl || null,
                      seriesId: fallback.seriesId,
                      episodeId: fallback.data.episodeId,
                      episodeNumber: fallback.data.episodeNumber || playingEpNum,
                      episodeTitle:
                        zipTitlePtBr(anizip, playingEpNum) ?? playing.ep.title ?? null,
                      audio:
                        normalizeAudio(sfhdPick.category) === "dub"
                          ? ("dublado" as const)
                          : ("legendado" as const),
                      position: 1,
                      duration: 1,
                    });
                  }}
                />
                <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] text-sky-300">
                  <TvMinimalPlay className="h-3.5 w-3.5" />
                  Tocando pela fonte HLS (animesfhd.net
                  {sfhdPick?.category === "dublado" ? " · dublado" : " · legendado"})
                  — ativa automaticamente quando o vídeo principal falha.
                </p>
              </div>
            ) : (
              <div className="relative">
                <video
                  key={playing.ep.id + quality}
                  ref={videoRef}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  poster={
                    playing.ep.thumbnailLarge ||
                    zipEpisode(anizip, playingEpNum)?.image ||
                    undefined
                  }
                  onTimeUpdate={onTimeUpdate}
                  onEnded={onVideoEnded}
                  onLoadedMetadata={() => {
                    // Retomada: pula para a posição salva do histórico
                    const v = videoRef.current;
                    if (
                      v &&
                      pendingSeekRef.current > 1 &&
                      v.duration > 0 &&
                      pendingSeekRef.current < v.duration - 5
                    ) {
                      v.currentTime = pendingSeekRef.current;
                    }
                    pendingSeekRef.current = 0;
                  }}
                  onError={() => {
                    // Erro no MP4 primário → fallback HLS automático quando
                    // existe casamento no animesfhd (ponte MAL)
                    setPrimaryFailed(true);
                    if (sfhdPick) setFallbackWanted(true);
                  }}
                  className="aspect-video w-full bg-black"
                >
                  <source src={urlFor(playing.ep) ?? undefined} type="video/mp4" />
                  Seu navegador não suporta reprodução de vídeo.
                </video>
                {skipBtn ? (
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = skipBtn.to;
                      }
                      setSkipBtnState(null);
                    }}
                    className="absolute bottom-16 right-4 inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-black/85 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-fuchsia-600/90 md:bottom-20"
                  >
                    {skipBtn.label}
                    <SkipForward className="h-4 w-4" />
                  </button>
                ) : null}
                {primaryFailed ? (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Fonte principal falhou
                      {fallback.status === "loading"
                        ? " — ativando HLS (animesfhd)..."
                        : sfhdPick
                          ? " — HLS ativado acima"
                          : " — sem fonte HLS casada (use a ponte abaixo)"}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {zipTitlePtBr(anizip, playingEpNum) ??
                  playing.ep.title ??
                  `Episódio ${playing.ep.episodeNumber ?? ""}`}
              </p>
              {fallback.status !== "ready" ? (
                <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
                  {(["SD", "HD", "FHD"] as const).map((q) => {
                    const available =
                      q === "FHD"
                        ? playing.ep.videoUrlFhd
                        : q === "SD"
                          ? playing.ep.videoUrlSd
                          : playing.ep.videoUrl;
                    if (!available) return null;
                    return (
                      <button
                        key={q}
                        onClick={() => setQuality(q)}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-bold transition-colors",
                          quality === q
                            ? "bg-fuchsia-600 text-white"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {sfhdPick && fallback.status !== "ready" ? (
                <button
                  onClick={() => setFallbackWanted(true)}
                  disabled={fallback.status === "loading"}
                  className="flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-950/40 px-2.5 py-1.5 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-950/70 disabled:opacity-60"
                  title="Trocar para a fonte HLS do animesfhd.net"
                >
                  {fallback.status === "loading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <TvMinimalPlay className="h-3.5 w-3.5" />
                  )}
                  HLS
                </button>
              ) : null}
              {fallback.status !== "ready" && playing.ep.videoUrl ? (
                <a
                  href={urlFor(playing.ep) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  abrir em nova aba
                </a>
              ) : null}
            </div>
            {fallback.status === "error" ? (
              <p className="mx-4 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Fallback HLS falhou: {fallback.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Temporadas (lista retrátil) + preferência de áudio */}
      {seasons.length > 1 ? (
        <SeasonPicker
          seasons={seasons}
          seasonIdx={seasonIdx}
          onSelect={(i) => {
            setSeasonIdx(i);
            setPlaying(null);
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
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            Episódios{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({episodes.length})
            </span>
          </h2>
          {seasons.length > 1 ? null : <AudioPrefToggle compact className="md:hidden" />}
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
              const thumb = ep.thumbnailLarge || zipEpisode(anizip, n)?.image || null;
              const entry = olEntryFor(ep.id);
              const pct = entry ? watchPercent(entry) : null;
              const watched = entry ? isWatched(entry) : false;
              return (
                <button
                  key={ep.id}
                  onClick={() => {
                    setPlaying({ ep });
                    requestAnimationFrame(() =>
                      playerRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      }),
                    );
                  }}
                  className={cn(
                    "group flex gap-3 rounded-xl border p-2 text-left transition-all hover:border-fuchsia-500/60 hover:bg-secondary/50",
                    playing?.ep.id === ep.id
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
                    {/* Mini barra de progresso */}
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
                  {sfhdPick.episodeCount} episódios em streaming HLS ({sfhdPick.category === "dublado" ? "dublado" : "legendado"})
                  · casamento verificado pelo MAL id {malId}
                  {audioPref && sfhdPick.category &&
                  normalizeAudio(sfhdPick.category) !== audioPref ? (
                    <span className="text-amber-400">
                      {" "}· versão {audioPref === "dub" ? "dublada" : "legendada"} não encontrada nesta fonte
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
    () => fetchJson(`/api/anime/detail?cid=${cid}`),
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

/* ---------- Recomendações (AniList, por similaridade de título) ---------- */

interface AniListRecItem {
  id: number;
  title: { romaji: string | null; english: string | null };
  coverImage: { large: string | null } | null;
  format: string | null;
  seasonYear: number | null;
}

function AnimeRecs({
  name,
  nameEn,
  nav,
}: {
  name: string;
  nameEn?: string | null;
  nav: Nav;
}) {
  const { data, loading } = useAsync<{ items: AniListRecItem[] }>(
    () =>
      fetchJson(
        `/api/anilist/recs?name=${encodeURIComponent(name)}${
          nameEn ? `&nameEn=${encodeURIComponent(nameEn)}` : ""
        }`,
      ),
    `anilist-recs:${name}`,
  );

  const items = data?.items ?? [];
  if (loading || items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Recomendados pra você</h2>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {items.map((m) => {
          const title = m.title.english ?? m.title.romaji ?? "Sem título";
          return (
            <button
              key={m.id}
              onClick={() => nav.push({ t: "search", q: title })}
              className="group w-28 shrink-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              aria-label={`Buscar ${title} no catálogo`}
              title={`Buscar "${title}" no OtakuVerse`}
            >
              <div className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-fuchsia-500/60 group-hover:shadow-lg">
                <Poster
                  src={m.coverImage?.large ?? null}
                  alt={title}
                  icon="anime"
                  className="h-full w-full"
                />
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-medium leading-tight group-hover:text-fuchsia-300">
                {title}
              </p>
              {m.seasonYear ? (
                <p className="text-[11px] text-muted-foreground">
                  {m.seasonYear}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Toque em um título para buscar no catálogo do OtakuVerse.
      </p>
    </section>
  );
}

/* ---------- Temporadas em lista retrátil ---------- */

function SeasonPicker({
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

/* ---------- Episódios em grupos retráteis (25 por grupo) ---------- */

const EP_GROUP_SIZE = 25;

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
