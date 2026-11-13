"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  SkipForward,
  Sparkles,
  TvMinimalPlay,
} from "lucide-react";
import { fetchJson } from "./use-async";
import { HlsPlayer } from "./hls-player";
import { normalizeAudio } from "./library";
import {
  epNumFromTitle,
  type SfhdMatchItem,
  zipEpisode,
  zipTitlePtBr,
} from "./anime-detail-helpers";
import type { AniListMedia } from "@/lib/anilist";
import type { AniZipMapping } from "@/lib/anizip";
import type { SkipTimes } from "@/lib/aniskip";
import type { SfhdSourcesResult } from "@/lib/animesfhd";
import type { AnimeCatalogDetail, EpisodeInfo } from "@/lib/otakulogia";
import type { TomatoMatchItem, TomatoStreamResult } from "@/lib/tomato";
import { saveWatchProgress, useProgressSaver } from "@/lib/local-store";
import { cn } from "@/lib/utils";

export type PlayerMode = "primary" | "tomato" | "sfhd";
export type VideoQuality = "SD" | "HD" | "FHD";

type TomatoFetchResult =
  | { key: string; status: "ready"; data: TomatoStreamResult }
  | { key: string; status: "error"; message: string };

type SfhdFetchResult =
  | { key: string; status: "ready"; data: SfhdSourcesResult; seriesId: string }
  | { key: string; status: "error"; message: string };

export function AnimePlayerPanel({
  anime,
  ep,
  startAt,
  seasonIdx,
  quality,
  mode,
  media,
  anizip,
  audioPref,
  sfhdPick,
  tomatoPick,
  onQualityChange,
  onModeChange,
}: {
  anime: AnimeCatalogDetail["anime"];
  ep: EpisodeInfo;
  startAt: number;
  seasonIdx: number;
  quality: VideoQuality;
  mode: PlayerMode;
  media: AniListMedia | null;
  anizip: AniZipMapping | null;
  audioPref: "" | "leg" | "dub";
  sfhdPick: SfhdMatchItem | null;
  tomatoPick: TomatoMatchItem | null;
  onQualityChange: (q: VideoQuality) => void;
  onModeChange: (m: PlayerMode) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekAppliedForKeyRef = useRef<string>("");
  const saveProgress = useProgressSaver(5);

  const playingEpNum = epNumFromTitle(ep.title) ?? ep.episodeNumber ?? null;
  const malId = media?.idMal ?? null;
  const streamKey = `${ep.id}:${quality}`;

  const [failedStreamKey, setFailedStreamKey] = useState<string>("");
  const primaryFailed = failedStreamKey === streamKey;

  /* ----- Skip times (AniSkip) ----- */
  const skipKey =
    malId && playingEpNum ? `${ep.id}:${malId}:${playingEpNum}` : "";
  const lengthMin = zipEpisode(anizip, playingEpNum)?.length ?? null;
  const [skipState, setSkipState] = useState<{
    key: string;
    skip: SkipTimes | null;
  }>({ key: "", skip: null });
  const [skipBtnState, setSkipBtnState] = useState<{
    key: string;
    label: string;
    to: number;
  } | null>(null);

  useEffect(() => {
    if (!skipKey) return;
    const controller = new AbortController();
    let alive = true;
    const [, malIdStr, epStr] = skipKey.split(":");
    const lenParam = lengthMin ? `&length=${lengthMin * 60}` : "";
    fetchJson<{ skip: SkipTimes | null }>(
      `/api/skip-times?malId=${malIdStr}&ep=${epStr}${lenParam}`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (alive && !controller.signal.aborted) {
          setSkipState({ key: skipKey, skip: r.skip ?? null });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      controller.abort();
    };
  }, [skipKey, lengthMin]);

  const skip = skipState.key === skipKey ? skipState.skip : null;
  const skipBtn =
    skipBtnState && skipBtnState.key === skipKey
      ? { label: skipBtnState.label, to: skipBtnState.to }
      : null;

  /* ----- Fonte Tomato (1080p FHD) ----- */
  const tomatoKey =
    mode === "tomato" && tomatoPick && playingEpNum
      ? `${ep.id}:${tomatoPick.id}:${playingEpNum}:${seasonIdx}:${audioPref}`
      : "";
  const [tomatoRes, setTomatoRes] = useState<TomatoFetchResult | null>(null);

  useEffect(() => {
    if (!tomatoKey || !tomatoPick || !playingEpNum) return;
    const controller = new AbortController();
    let alive = true;
    fetchJson<TomatoStreamResult>(
      `/api/anime/tomato-source?animeId=${tomatoPick.id}&epNumber=${playingEpNum}&seasonNumber=${seasonIdx + 1}&audio=${audioPref || ""}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (!res?.sources?.length) {
          throw new Error("Sem fontes no Tomato para este episódio");
        }
        if (alive && !controller.signal.aborted) {
          setTomatoRes({ key: tomatoKey, status: "ready", data: res });
        }
      })
      .catch((e) => {
        if (
          !alive ||
          controller.signal.aborted ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          return;
        }
        setTomatoRes({
          key: tomatoKey,
          status: "error",
          message:
            e instanceof Error
              ? e.message
              : "Falha ao resolver stream do Tomato",
        });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [tomatoKey, tomatoPick, playingEpNum, seasonIdx, audioPref]);

  const tomatoStatus = !tomatoKey
    ? { status: "idle" as const }
    : tomatoRes?.key === tomatoKey
      ? tomatoRes
      : { status: "loading" as const };

  /* ----- Fallback HLS (animesfhd) ----- */
  const sfhdKey =
    mode === "sfhd" && sfhdPick && playingEpNum
      ? `${ep.id}:${sfhdPick.seriesId}:${playingEpNum}`
      : "";
  const [sfhdRes, setSfhdRes] = useState<SfhdFetchResult | null>(null);

  useEffect(() => {
    if (!sfhdKey || !sfhdPick || !playingEpNum) return;
    const controller = new AbortController();
    let alive = true;
    (async () => {
      try {
        const det = await fetchJson<{ episodes: { id: string; number: number }[] }>(
          `/api/anime/sfhd-detail?seriesId=${encodeURIComponent(sfhdPick.seriesId)}`,
          { signal: controller.signal },
        );
        const matchEp =
          det.episodes.find((e) => e.number === playingEpNum) ??
          det.episodes.find((e) => e.number === playingEpNum - 1) ??
          det.episodes[0];
        if (!matchEp) throw new Error("Episódio não existe na fonte HLS");
        const src = await fetchJson<SfhdSourcesResult>(
          `/api/anime/sfhd-source?episodeId=${encodeURIComponent(matchEp.id)}`,
          { signal: controller.signal },
        );
        if (!src?.sources?.length) throw new Error("Sem fontes HLS agora");
        if (alive && !controller.signal.aborted) {
          setSfhdRes({
            key: sfhdKey,
            status: "ready",
            data: src,
            seriesId: sfhdPick.seriesId,
          });
        }
      } catch (e) {
        if (
          !alive ||
          controller.signal.aborted ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          return;
        }
        setSfhdRes({
          key: sfhdKey,
          status: "error",
          message:
            e instanceof Error ? e.message : "Falha ao resolver HLS",
        });
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [sfhdKey, sfhdPick, playingEpNum]);

  const fallbackStatus = !sfhdKey
    ? { status: "idle" as const }
    : sfhdRes?.key === sfhdKey
      ? sfhdRes
      : { status: "loading" as const };

  /* ----- Progresso local (Otakulogia MP4) ----- */
  const olEntry = {
    key: `ol:${anime.upstreamCid}:${ep.id}`,
    source: "otakulogia" as const,
    title: anime.name,
    posterUrl: media?.coverImage?.extraLarge || anime.posterUrl || null,
    thumbUrl: ep.thumbnailLarge || null,
    cid: anime.upstreamCid,
    episodeId: ep.id,
    episodeNumber: playingEpNum,
    episodeTitle: zipTitlePtBr(anizip, playingEpNum) ?? ep.title ?? null,
    audio:
      normalizeAudio(ep.audioType) === "dub"
        ? ("dublado" as const)
        : ("legendado" as const),
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    const t = v?.currentTime ?? 0;
    let next: { label: string; to: number } | null = null;
    if (skip) {
      if (skip.op && t >= skip.op.startTime && t < skip.op.endTime - 2) {
        next = { label: "Pular abertura", to: skip.op.endTime };
      } else if (skip.ed && t >= skip.ed.startTime && t < skip.ed.endTime - 2) {
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
    if (v && v.duration > 0 && Number.isFinite(v.duration)) {
      saveProgress(olEntry, t, v.duration);
    }
  };

  const onVideoEnded = () => {
    const v = videoRef.current;
    const dur =
      v?.duration && Number.isFinite(v.duration) ? Math.floor(v.duration) : 1;
    saveWatchProgress({ ...olEntry, position: dur, duration: dur });
  };

  const urlFor = (targetEp: EpisodeInfo) =>
    quality === "FHD"
      ? targetEp.videoUrlFhd || targetEp.videoUrl
      : quality === "SD"
        ? targetEp.videoUrlSd || targetEp.videoUrl
        : targetEp.videoUrl;

  return (
    <div className="overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-black shadow-2xl shadow-fuchsia-950/30">
      {tomatoStatus.status === "ready" ? (
        <div className="space-y-2 px-2 pt-2 sm:px-3 sm:pt-3">
          <HlsPlayer
            key={`tomato-stream-${tomatoStatus.data.episodeId}`}
            sources={tomatoStatus.data.sources}
            title={`${anime.name} ep ${tomatoStatus.data.episodeNumber || playingEpNum || ""}`}
            startAt={startAt}
            poster={
              ep.thumbnailLarge ||
              zipEpisode(anizip, playingEpNum)?.image ||
              null
            }
            onProgress={(p, d) => {
              saveProgress(
                {
                  key: `tomato:${tomatoStatus.data.animeId}:${tomatoStatus.data.episodeId}`,
                  source: "tomato",
                  title: anime.name,
                  posterUrl:
                    media?.coverImage?.extraLarge || anime.posterUrl || null,
                  cid: anime.upstreamCid,
                  episodeId: ep.id,
                  episodeNumber: playingEpNum,
                  episodeTitle:
                    zipTitlePtBr(anizip, playingEpNum) ?? ep.title ?? null,
                  audio: tomatoStatus.data.isDubbed
                    ? ("dublado" as const)
                    : ("legendado" as const),
                },
                p,
                d,
              );
            }}
            onEnded={() => {
              saveWatchProgress({
                key: `tomato:${tomatoStatus.data.animeId}:${tomatoStatus.data.episodeId}`,
                source: "tomato",
                title: anime.name,
                posterUrl:
                  media?.coverImage?.extraLarge || anime.posterUrl || null,
                cid: anime.upstreamCid,
                episodeId: ep.id,
                episodeNumber: playingEpNum,
                episodeTitle:
                  zipTitlePtBr(anizip, playingEpNum) ?? ep.title ?? null,
                audio: tomatoStatus.data.isDubbed
                  ? ("dublado" as const)
                  : ("legendado" as const),
                position: 1,
                duration: 1,
              });
            }}
          />
          <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] text-rose-400">
            <Sparkles className="h-3.5 w-3.5" />
            Tocando pela fonte Tomato (1080p FHD
            {tomatoStatus.data.isDubbed ? " · dublado" : " · legendado"}).
          </p>
        </div>
      ) : fallbackStatus.status === "ready" ? (
        <div className="space-y-2 px-2 pt-2 sm:px-3 sm:pt-3">
          <HlsPlayer
            key={`sfhd-fb-${fallbackStatus.data.episodeId}`}
            sources={fallbackStatus.data.sources}
            subtitleVttUrl={fallbackStatus.data.subtitleVttUrl}
            title={`${anime.name} ep ${fallbackStatus.data.episodeNumber || playingEpNum || ""}`}
            poster={
              ep.thumbnailLarge ||
              zipEpisode(anizip, playingEpNum)?.image ||
              null
            }
            onProgress={(p, d) => {
              if (!sfhdPick) return;
              saveProgress(
                {
                  key: `sfhd:${fallbackStatus.seriesId}:${fallbackStatus.data.episodeId}`,
                  source: "sfhd",
                  title: anime.name,
                  posterUrl:
                    media?.coverImage?.extraLarge || anime.posterUrl || null,
                  cid: anime.upstreamCid,
                  seriesId: fallbackStatus.seriesId,
                  episodeId: fallbackStatus.data.episodeId,
                  episodeNumber:
                    fallbackStatus.data.episodeNumber || playingEpNum,
                  episodeTitle:
                    zipTitlePtBr(anizip, playingEpNum) ?? ep.title ?? null,
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
                key: `sfhd:${fallbackStatus.seriesId}:${fallbackStatus.data.episodeId}`,
                source: "sfhd",
                title: anime.name,
                posterUrl:
                  media?.coverImage?.extraLarge || anime.posterUrl || null,
                seriesId: fallbackStatus.seriesId,
                episodeId: fallbackStatus.data.episodeId,
                episodeNumber:
                  fallbackStatus.data.episodeNumber || playingEpNum,
                episodeTitle:
                  zipTitlePtBr(anizip, playingEpNum) ?? ep.title ?? null,
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
            key={streamKey}
            ref={videoRef}
            controls
            autoPlay
            playsInline
            preload="metadata"
            poster={
              ep.thumbnailLarge ||
              zipEpisode(anizip, playingEpNum)?.image ||
              undefined
            }
            onTimeUpdate={onTimeUpdate}
            onEnded={onVideoEnded}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (
                v &&
                seekAppliedForKeyRef.current !== ep.id &&
                startAt > 1 &&
                v.duration > 0 &&
                startAt < v.duration - 5
              ) {
                v.currentTime = startAt;
              }
              seekAppliedForKeyRef.current = ep.id;
            }}
            onError={() => {
              setFailedStreamKey(streamKey);
              if (tomatoPick) {
                onModeChange("tomato");
              } else if (sfhdPick) {
                onModeChange("sfhd");
              }
            }}
            className="aspect-video w-full bg-black"
          >
            <source src={urlFor(ep) ?? undefined} type="video/mp4" />
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
                {tomatoStatus.status === "loading"
                  ? " — ativando Tomato (1080p)..."
                  : fallbackStatus.status === "loading"
                    ? " — ativando HLS (animesfhd)..."
                    : tomatoPick
                      ? " — Tomato ativado acima"
                      : sfhdPick
                        ? " — HLS ativado acima"
                        : " — sem fontes alternativas casadas"}
              </p>
            </div>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {zipTitlePtBr(anizip, playingEpNum) ??
            ep.title ??
            `Episódio ${ep.episodeNumber ?? ""}`}
        </p>
        {fallbackStatus.status !== "ready" &&
        tomatoStatus.status !== "ready" ? (
          <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
            {(["SD", "HD", "FHD"] as const).map((q) => {
              const available =
                q === "FHD"
                  ? ep.videoUrlFhd
                  : q === "SD"
                    ? ep.videoUrlSd
                    : ep.videoUrl;
              if (!available) return null;
              return (
                <button
                  key={q}
                  onClick={() => onQualityChange(q)}
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
        {tomatoPick && tomatoStatus.status !== "ready" ? (
          <button
            onClick={() => onModeChange("tomato")}
            disabled={tomatoStatus.status === "loading"}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-950/40 px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-950/70 disabled:opacity-60"
            title="Trocar para a fonte Tomato (1080p FHD)"
          >
            {tomatoStatus.status === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-rose-400" />
            )}
            Tomato
          </button>
        ) : null}
        {sfhdPick && fallbackStatus.status !== "ready" ? (
          <button
            onClick={() => onModeChange("sfhd")}
            disabled={fallbackStatus.status === "loading"}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-950/40 px-2.5 py-1.5 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-950/70 disabled:opacity-60"
            title="Trocar para a fonte HLS do animesfhd.net"
          >
            {fallbackStatus.status === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <TvMinimalPlay className="h-3.5 w-3.5" />
            )}
            HLS
          </button>
        ) : null}
        {fallbackStatus.status !== "ready" &&
        tomatoStatus.status !== "ready" &&
        ep.videoUrl ? (
          <a
            href={urlFor(ep) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            abrir em nova aba
          </a>
        ) : null}
      </div>
      {tomatoStatus.status === "error" ? (
        <p className="mx-4 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Tomato falhou: {tomatoStatus.message}
        </p>
      ) : null}
      {fallbackStatus.status === "error" ? (
        <p className="mx-4 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Fallback HLS falhou: {fallbackStatus.message}
        </p>
      ) : null}
    </div>
  );
}
