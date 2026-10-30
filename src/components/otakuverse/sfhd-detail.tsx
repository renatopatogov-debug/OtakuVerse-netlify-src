"use client";

// Detalhe de uma série da fonte alternativa animesfhd.net:
// metadados TMDB + MAL id + lista completa de episódios e player HLS
// com troca de fontes (CDN direta / proxies do animesfhd).
// + Biblioteca local: favoritos, progresso (Continuar Assistindo),
//   retomada de episódio, checks de assistido e atalho LEG↔DUB.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  BookMarked,
  CheckCircle2,
  Clock3,
  Languages,
  Loader2,
  PlayCircle,
  Star,
} from "lucide-react";
import { fetchJson, useAsync } from "./use-async";
import { GENRE_PT, Poster } from "./cards";
import { HlsPlayer, type PlayerSource } from "./hls-player";
import { FavButton, normalizeAudio } from "./library";
import type { Nav } from "./types";
import {
  getWatchHistory,
  isWatched,
  saveWatchProgress,
  usePreferredAudio,
  useProgressSaver,
  useWatchHistory,
  watchPercent,
} from "@/lib/local-store";

/* ---------- Tipos (espelham src/lib/animesfhd.ts) ---------- */

interface SfhdSeriesDetail {
  seriesId: string;
  title: string;
  altTitles: string[];
  description: string | null;
  coverUrl: string | null;
  backdropUrl: string | null;
  year: number | null;
  genres: string[];
  category: string | null;
  status: string | null;
  episodeCount: number;
  malId: number | null;
  episodes: {
    id: string;
    number: number;
    title: string | null;
    description: string | null;
    thumbnailUrl: string | null;
  }[];
}

interface SfhdSourcesResult {
  episodeId: string;
  seriesId: string;
  seriesTitle: string;
  episodeNumber: number;
  title: string | null;
  malId: number | null;
  subtitleVttUrl: string | null;
  sources: (PlayerSource & { url: string; subtitleUrl: string | null })[];
}

const EP_CHUNK = 120;

/* ---------- Player do episódio selecionado ---------- */

function SfhdEpisodePlayer({
  episodeId,
  title,
  onProgress,
  onEnded,
  startAt,
}: {
  episodeId: string;
  title: string;
  onProgress?: (position: number, duration: number) => void;
  onEnded?: () => void;
  startAt?: number;
}) {
  const { data, loading, error } = useAsync<SfhdSourcesResult>(
    () =>
      fetchJson(
        `/api/anime/sfhd-source?episodeId=${encodeURIComponent(episodeId)}`,
      ),
    `sfhd-source:${episodeId}`,
  );

  if (loading) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-border/60 bg-black/60">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Resolvendo fontes de
          vídeo...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error ?? "Nenhuma fonte de vídeo para este episódio."}
      </div>
    );
  }

  return (
    <HlsPlayer
      key={episodeId}
      sources={data.sources}
      poster={null}
      subtitleVttUrl={data.subtitleVttUrl}
      title={title}
      onProgress={onProgress}
      onEnded={onEnded}
      startAt={startAt}
    />
  );
}

/* ---------- Página de detalhe ---------- */

export function SfhdDetail({
  seriesId,
  nav,
  epId,
}: {
  seriesId: string;
  nav: Nav;
  epId?: string;
}) {
  const { data, loading, error } = useAsync<SfhdSeriesDetail>(
    () =>
      fetchJson(
        `/api/anime/sfhd-detail?seriesId=${encodeURIComponent(seriesId)}`,
      ),
    `sfhd-detail:${seriesId}`,
  );
  // Retomada: deep-link do histórico seleciona o episódio salvo
  const [selectedEp, setSelectedEp] = useState<string | null>(epId ?? null);
  const [visible, setVisible] = useState(EP_CHUNK);

  /* ----- Biblioteca local ----- */
  const saveProgress = useProgressSaver(5);
  const { entries: historyEntries } = useWatchHistory();
  const [audioPref] = usePreferredAudio();

  // Progresso por episódio desta série (para barra + check + retomada)
  const progressByEp = useMemo(() => {
    const map = new Map<string, { pct: number; watched: boolean; position: number }>();
    for (const e of historyEntries) {
      if (e.key.startsWith(`sfhd:${seriesId}:`) && e.episodeId) {
        const pct = watchPercent(e);
        map.set(e.episodeId, {
          pct: pct ?? 0,
          watched: isWatched(e),
          position: e.position,
        });
      }
    }
    return map;
  }, [historyEntries, seriesId]);

  // Posição de retomada do player (seek ao abrir episódio com progresso)
  const [startAt, setStartAt] = useState(() => {
    // Deep-link do histórico: retoma do segundo salvo do episódio linkado
    if (!epId) return 0;
    const e = getWatchHistory().find(
      (x) => x.key === `sfhd:${seriesId}:${epId}`,
    );
    return e && !isWatched(e) ? e.position : 0;
  });

  /* ----- Atalho LEG↔DUB: busca a versão com o áudio preferido ----- */
  // Estado com key derivada (padrão do projeto): enquanto a key não bate,
  // volta a "idle" — sem setState síncrono no effect (react-hooks v6).
  const [otherVersion, setOtherVersion] = useState<{
    key: string;
    state: "idle" | "loading" | "found" | "notfound";
    seriesId?: string;
    category?: string | null;
  }>({ key: "", state: "idle" });

  const otherKey = `${seriesId}:${audioPref ?? ""}:${data?.category ?? ""}`;
  const other =
    otherVersion.key === otherKey
      ? otherVersion
      : { key: otherKey, state: "idle" as const };

  const wantsOther =
    !!data?.category &&
    !!audioPref &&
    normalizeAudio(data.category) !== audioPref;

  const findOtherVersion = async () => {
    if (!data) return;
    setOtherVersion({ key: otherKey, state: "loading" });
    try {
      const r = await fetchJson<{ items: { slug: string; title: string }[] }>(
        `/api/anime/sfhd-search?q=${encodeURIComponent(data.title)}`,
      );
      const wantedCat = audioPref === "dub" ? "dublado" : "legendado";
      // Confirma a categoria pedindo o detalhe (barato: cache 6h no server)
      for (const it of r.items.slice(0, 5)) {
        if (it.slug === seriesId) continue;
        const det = await fetchJson<SfhdSeriesDetail>(
          `/api/anime/sfhd-detail?seriesId=${encodeURIComponent(it.slug)}`,
        );
        if (det.category === wantedCat) {
          setOtherVersion({
            key: otherKey,
            state: "found",
            seriesId: det.seriesId,
            category: det.category,
          });
          return;
        }
      }
      setOtherVersion({ key: otherKey, state: "notfound" });
    } catch {
      setOtherVersion({ key: otherKey, state: "notfound" });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Falha ao carregar da fonte animesfhd: {error ?? "não encontrado"}
        <div className="mt-4">
          <button
            onClick={() => nav.back()}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const selected =
    data.episodes.find((e) => e.id === selectedEp) ?? data.episodes[0] ?? null;
  const statusPt =
    data.status === "ongoing"
      ? "Em lançamento"
      : data.status === "completed"
        ? "Completo"
        : data.status;
  const audioLabel = data.category === "dublado" ? "dublado" : "legendado";

  /* Base do registro de progresso (o resto — position/duration — vem do player) */
  const progressBase = {
    key: `sfhd:${data.seriesId}:${selected?.id ?? ""}`,
    source: "sfhd" as const,
    title: data.title,
    posterUrl: data.coverUrl,
    thumbUrl: selected?.thumbnailUrl ?? null,
    seriesId: data.seriesId,
    episodeId: selected?.id ?? "",
    episodeNumber: selected?.number ?? null,
    episodeTitle: selected?.title ?? null,
    audio: (audioLabel === "dublado" ? "dublado" : "legendado") as
      | "dublado"
      | "legendado",
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60">
        {data.backdropUrl ? (
          <img
            src={data.backdropUrl}
            alt=""
            className="h-40 w-full object-cover sm:h-56"
            loading="lazy"
          />
        ) : (
          <div className="h-28 w-full bg-gradient-to-r from-sky-950/60 via-zinc-900 to-fuchsia-950/60 sm:h-40" />
        )}
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
          <div className="-mt-16 w-28 shrink-0 sm:-mt-24 sm:w-36">
            <div className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-border/60 shadow-xl">
              <Poster
                src={data.coverUrl}
                alt={data.title}
                icon="anime"
                className="h-full w-full"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-sky-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                FONTE HLS
              </span>
              <span className="text-[11px] text-muted-foreground">
                animesfhd.net
              </span>
              {data.category ? (
                <span className="flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-sky-300">
                  <Languages className="h-3 w-3" />
                  {data.category === "dublado" ? "Dublado" : "Legendado"}
                </span>
              ) : null}
              {data.year ? (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock3 className="h-3 w-3" /> {data.year}
                </span>
              ) : null}
              {statusPt ? (
                <span className="text-[11px] text-muted-foreground">
                  · {statusPt}
                </span>
              ) : null}
              <FavButton
                entry={{
                  key: `sfhd:${data.seriesId}`,
                  kind: "anime",
                  title: data.title,
                  posterUrl: data.coverUrl,
                  seriesId: data.seriesId,
                  year: data.year ?? null,
                }}
              />
            </div>
            <h1 className="text-2xl font-bold leading-tight">{data.title}</h1>
            {data.altTitles.length > 0 ? (
              <p className="text-xs italic text-muted-foreground">
                {data.altTitles.slice(0, 3).join(" · ")}
              </p>
            ) : null}
            {data.genres.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {data.genres.slice(0, 6).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-border/60 bg-secondary/60 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {GENRE_PT[g] ?? g}
                  </span>
                ))}
              </div>
            ) : null}
            {data.malId ? (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <BookMarked className="h-3 w-3" />
                MAL id {data.malId} · casamento automático com AniList/ani.zip
              </p>
            ) : null}
            {data.description ? (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {data.description.slice(0, 400)}
                {data.description.length > 400 ? "..." : ""}
              </p>
            ) : null}

            {/* Atalho para a outra versão (LEG↔DUB) */}
            {wantsOther ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {other.state === "found" && other.seriesId ? (
                  <button
                    onClick={() =>
                      nav.push({
                        t: "sfhd-detail",
                        seriesId: other.seriesId!,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-950/70"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Ver versão {audioPref === "dub" ? "dublada" : "legendada"}
                  </button>
                ) : other.state === "loading" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procurando
                    versão {audioPref === "dub" ? "dublada" : "legendada"}...
                  </span>
                ) : other.state === "notfound" ? (
                  <span className="text-[11px] text-muted-foreground">
                    Versão {audioPref === "dub" ? "dublada" : "legendada"} não
                    encontrada no animesfhd.
                  </span>
                ) : (
                  <button
                    onClick={findOtherVersion}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-950/60"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Procurar versão {audioPref === "dub" ? "dublada" : "legendada"}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Player */}
      {selected ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <PlayCircle className="h-5 w-5 text-sky-400" />
            <h2 className="text-lg font-bold">
              Episódio {selected.number}
              {selected.title ? ` — ${selected.title}` : ""}
            </h2>
            <span className="flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
              <Star className="h-2.5 w-2.5" fill="currentColor" /> HLS
            </span>
            {(() => {
              const p = progressByEp.get(selected.id);
              return p && p.pct > 0 && !p.watched ? (
                <span className="rounded bg-fuchsia-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {p.pct}% assistido
                </span>
              ) : p?.watched ? (
                <span className="flex items-center gap-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  <CheckCircle2 className="h-2.5 w-2.5" /> ASSISTIDO
                </span>
              ) : null;
            })()}
          </div>
          <SfhdEpisodePlayer
            key={selected.id}
            episodeId={selected.id}
            title={`${data.title} ep ${selected.number}`}
            startAt={startAt}
            onProgress={(pos, dur) =>
              saveProgress(
                progressBase,
                pos,
                dur,
                // primeiro tick força a gravação (entrada no histórico)
                false,
              )
            }
            onEnded={() =>
              saveWatchProgress({
                ...progressBase,
                position: 1,
                duration: 1,
              })
            }
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Fonte animesfhd.net — quando disponível, o vídeo toca direto da CDN
            (HLS) sem passar por proxy. Os players AniStream/AniTube do site
            ficam instáveis às vezes; use os botões de fonte abaixo do player
            para alternar.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          Nenhum episódio publicado nesta série ainda.
        </div>
      )}

      {/* Lista de episódios */}
      {data.episodes.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              Episódios{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({data.episodes.length})
              </span>
            </h2>
            {data.episodes.length > visible ? (
              <button
                onClick={() => setVisible((v) => v + EP_CHUNK)}
                className="rounded-lg border border-sky-500/40 bg-sky-950/30 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-950/60"
              >
                Mostrar mais ({data.episodes.length - visible} restantes)
              </button>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.episodes.slice(0, visible).map((e) => {
              const p = progressByEp.get(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => {
                    setSelectedEp(e.id);
                    // Retoma do ponto salvo (episódios já assistidos recomeçam)
                    const p = progressByEp.get(e.id);
                    setStartAt(p && !p.watched && p.position > 1 ? p.position : 0);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                    selected?.id === e.id
                      ? "border-sky-500/70 bg-sky-950/40"
                      : "border-border/60 bg-card/60 hover:border-sky-500/40 hover:bg-secondary/60"
                  }`}
                  aria-label={`Assistir episódio ${e.number}${e.title ? ` — ${e.title}` : ""}`}
                >
                  {e.thumbnailUrl ? (
                    <span className="relative shrink-0">
                      <img
                        src={e.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="h-10 w-16 rounded-md object-cover"
                      />
                      {p?.watched ? (
                        <span className="absolute -right-1 -top-1 rounded-full bg-emerald-600 text-white">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                      {p && !p.watched && p.pct > 0 ? (
                        <span className="absolute inset-x-0 bottom-0 h-1 rounded-b-md bg-black/70">
                          <span
                            className="block h-full rounded-b-md bg-gradient-to-r from-fuchsia-500 to-violet-400"
                            style={{ width: `${p.pct}%` }}
                          />
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-bold">
                      {e.number}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">
                      EP {e.number}
                    </span>
                    <span className="line-clamp-2 block text-xs leading-snug text-muted-foreground">
                      {e.title ?? `Episódio ${e.number}`}
                    </span>
                  </span>
                  {p?.watched ? (
                    <span className="shrink-0 text-[9px] font-bold uppercase text-emerald-400">
                      visto
                    </span>
                  ) : p && !p.watched && p.pct > 0 ? (
                    <span className="shrink-0 text-[9px] font-bold text-fuchsia-400">
                      {p.pct}%
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
