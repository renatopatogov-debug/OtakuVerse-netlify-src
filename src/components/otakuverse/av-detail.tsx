"use client";

// Detalhe de um anime da fonte animevillage.org (4ª alternativa — HLS
// com CORS aberto). Espelho AniList: banner, gêneros, nota e idMal direto
// da API. LEG/DUB nativo (o site expõe as duas listas de episódios).
// Biblioteca local: favoritos, progresso por episódio, retomada (startAt),
// checks de assistido. Padrão key-derivado nos effects (react-hooks v6).

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Languages,
  Loader2,
  Star,
} from "lucide-react";
import { fetchJson, useAsync } from "./use-async";
import { Poster } from "./cards";
import { FavButton } from "./library";
import { HlsPlayer, type PlayerSource } from "./hls-player";
import type { Nav } from "./types";
import {
  getWatchHistory,
  isWatched,
  useProgressSaver,
  useWatchHistory,
  watchPercent,
} from "@/lib/local-store";
import { cn } from "@/lib/utils";

/* ---------- Tipos da API /api/anime/av-* ---------- */

interface AvDetailData {
  detail: {
    slug: string;
    anilistId: number | null;
    malId: number | null;
    title: string;
    titleEnglish: string | null;
    synopsis: string | null;
    posterUrl: string | null;
    bannerUrl: string | null;
    genres: string[];
    averageScore: number | null;
    year: number | null;
    format: string | null;
    status: string | null;
    totalEpisodes: number | null;
  };
  sub: { epId: string; number: number; title: string | null }[];
  dub: { epId: string; number: number; title: string | null }[];
}

interface AvStreamData {
  sources: PlayerSource[];
  subtitleVttUrl: string | null;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

const EP_CHUNK = 120;

/* ---------- Player (resolve o stream e monta o HlsPlayer) ---------- */

function AvPlayer({
  slug,
  ep,
  category,
  title,
  onProgress,
  onEnded,
  startAt,
}: {
  slug: string;
  ep: string;
  category: "sub" | "dub";
  title: string;
  onProgress?: (position: number, duration: number) => void;
  onEnded?: () => void;
  startAt?: number;
}) {
  const { data, loading, error } = useAsync<AvStreamData>(
    () =>
      fetchJson(
        `/api/anime/av-stream?slug=${encodeURIComponent(slug)}&ep=${ep}&category=${category}`,
      ),
    `av-stream:${slug}:${ep}:${category}`,
  );

  if (loading) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-border/60 bg-black/40">
        <Loader2 className="h-7 w-7 animate-spin text-sky-500" />
      </div>
    );
  }
  if (error || !data || data.sources.length === 0) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 text-center text-sm text-destructive">
        <AlertTriangle className="h-6 w-6" />
        {error ?? "Nenhuma fonte disponível"}
        <span className="text-xs text-muted-foreground">
          A fonte pode estar fora do ar ou este item pode não ter servidor de
          vídeo agora (é uma fonte alternativa) — tenta outro episódio ou
          volta mais tarde.
        </span>
      </div>
    );
  }
  return (
    <HlsPlayer
      key={`${ep}:${category}`}
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

export function AvDetail({
  slug,
  nav,
  epId,
}: {
  slug: string;
  nav: Nav;
  epId?: string;
}) {
  const { data, loading, error } = useAsync<AvDetailData>(
    () =>
      fetchJson(`/api/anime/av-detail?slug=${encodeURIComponent(slug)}`),
    `av-detail:${slug}`,
  );

  const [selectedEp, setSelectedEp] = useState<string | null>(epId ?? null);
  const [category, setCategory] = useState<"sub" | "dub">("sub");
  const [visible, setVisible] = useState(EP_CHUNK);

  /* ----- Biblioteca local ----- */
  const saveProgress = useProgressSaver(5);
  const { entries: historyEntries } = useWatchHistory();

  const progressByEp = useMemo(() => {
    const map = new Map<
      string,
      { pct: number; watched: boolean; position: number }
    >();
    // O search às vezes entrega só o id numérico; o histórico é gravado com
    // o slug canônico que veio no detail — usamos ele quando existe.
    const keySlug = data?.detail.slug || slug;
    for (const e of historyEntries) {
      if (e.key.startsWith(`av:${keySlug}:`) && e.episodeId) {
        map.set(e.episodeId, {
          pct: watchPercent(e) ?? 0,
          watched: isWatched(e),
          position: e.position,
        });
      }
    }
    return map;
  }, [historyEntries, slug, data]);

  const [startAt, setStartAt] = useState(() => {
    if (!epId) return 0;
    const found = getWatchHistory().find((x) => x.key.startsWith(`av:`) && x.key.endsWith(`:${epId}`));
    return found && !isWatched(found) ? found.position : 0;
  });

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
        Falha ao carregar da fonte animevillage: {error ?? "não encontrado"}
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

  const { detail } = data;
  const realSlug = detail.slug || slug;
  const list = category === "dub" ? data.dub : data.sub;
  const episodes = list.slice(0, visible);

  // Se trocou pra DUB e o ep selecionado não existe nessa lista, volta pro 1º
  const selected =
    list.find((e) => e.epId === selectedEp) ??
    (category === "sub" ? data.sub[0] : data.dub[0]) ??
    null;

  const statusPt =
    detail.status === "RELEASING"
      ? "Em lançamento"
      : detail.status === "FINISHED"
        ? "Completo"
        : detail.status === "NOT_YET_RELEASED"
          ? "Não lançado"
          : null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60">
        {detail.bannerUrl ? (
          <img
            src={detail.bannerUrl}
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
                src={detail.posterUrl}
                alt={detail.title}
                icon="anime"
                className="h-full w-full"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-violet-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                FONTE HLS
              </span>
              <span className="text-[11px] text-muted-foreground">
                animevillage.org
              </span>
              {detail.averageScore ? (
                <span className="flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-amber-400">
                  <Star className="h-3 w-3" fill="currentColor" />
                  {(detail.averageScore / 10).toFixed(1)}
                </span>
              ) : null}
              {detail.year ? (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock3 className="h-3 w-3" /> {detail.year}
                </span>
              ) : null}
              {statusPt ? (
                <span className="text-[11px] text-muted-foreground">
                  · {statusPt}
                </span>
              ) : null}
              <FavButton
                entry={{
                  key: `av:${detail.slug}`,
                  kind: "anime",
                  title: detail.title,
                  posterUrl: detail.posterUrl,
                  slug: detail.slug,
                  year: detail.year ?? null,
                  audioMix:
                    data.dub.length > 0
                      ? "LEG+DUB"
                      : data.sub.length > 0
                        ? "LEG"
                        : null,
                }}
              />
            </div>
            <h1 className="text-2xl font-extrabold leading-tight md:text-3xl">
              {detail.title}
            </h1>
            {detail.genres.length ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.genres.slice(0, 6).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {g}
                  </span>
                ))}
              </div>
            ) : null}
            {detail.synopsis ? (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {detail.synopsis.length > 500
                  ? detail.synopsis.slice(0, 500) + "…"
                  : detail.synopsis}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Player + episódios */}
      <div className="space-y-4">
        {selected ? (
          <>
            <AvPlayer
              slug={realSlug}
              ep={selected.epId}
              category={category}
              title={`${detail.title} — EP ${selected.number}`}
              onProgress={(position, duration) => {
                saveProgress(
                  {
                    key: `av:${realSlug}:${selected.epId}`,
                    source: "av",
                    title: detail.title,
                    posterUrl: detail.posterUrl,
                    episodeId: selected.epId,
                    episodeNumber: selected.number,
                    episodeTitle: selected.title,
                    audio: category === "dub" ? "dublado" : "legendado",
                    slug: realSlug,
                  },
                  position,
                  duration,
                );
              }}
              onEnded={() => {
                saveProgress(
                  {
                    key: `av:${realSlug}:${selected.epId}`,
                    source: "av",
                    title: detail.title,
                    posterUrl: detail.posterUrl,
                    episodeId: selected.epId,
                    episodeNumber: selected.number,
                    episodeTitle: selected.title,
                    audio: category === "dub" ? "dublado" : "legendado",
                  },
                  1,
                  1,
                  true,
                );
              }}
              startAt={startAt}
            />

            {/* Troca de versão LEG/DUB (nativa do animevillage) */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-lg bg-secondary p-1">
                {(["sub", "dub"] as const).map((cat) => {
                  const count = cat === "sub" ? data.sub.length : data.dub.length;
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        setCategory(cat);
                        setSelectedEp(null);
                        setStartAt(0);
                      }}
                      disabled={count === 0}
                      className={cn(
                        "flex items-center gap-1 rounded px-3 py-1 text-xs font-semibold transition-colors",
                        category === cat
                          ? "bg-violet-600 text-white"
                          : "text-muted-foreground hover:text-foreground",
                        count === 0 && "cursor-not-allowed opacity-40",
                      )}
                      title={
                        count === 0
                          ? "Sem episódios nesta versão no animevillage"
                          : undefined
                      }
                    >
                      <Languages className="h-3 w-3" />
                      {cat === "sub" ? "Legendado" : "Dublado"}
                      <span className="ml-1 opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {list.length} eps · legendas e HLS direto do CDN
              </span>
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-border/60 py-8 text-center text-sm text-muted-foreground">
            Nenhum episódio disponível nesta versão.
          </p>
        )}

        {/* Lista de episódios */}
        {list.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-lg font-bold">Episódios</h2>
            <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
              {episodes.map((e) => {
                const prog = progressByEp.get(e.epId);
                const active = selected?.epId === e.epId;
                return (
                  <button
                    key={e.epId}
                    onClick={() => {
                      if (active) return;
                      setStartAt(() => {
                        const saved = getWatchHistory().find(
                          (x) => x.key === `av:${realSlug}:${e.epId}`,
                        );
                        return saved && !isWatched(saved) ? saved.position : 0;
                      });
                      setSelectedEp(e.epId);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors",
                      active
                        ? "border-violet-500/60 bg-violet-950/30"
                        : "border-border/60 hover:border-violet-500/60 hover:bg-secondary/50",
                    )}
                  >
                    <span
                      className={cn(
                        "w-12 shrink-0 text-center text-sm font-bold",
                        active ? "text-violet-300" : "text-muted-foreground",
                      )}
                    >
                      {e.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm",
                          prog?.watched && "text-muted-foreground",
                        )}
                      >
                        {e.title ?? `Episódio ${e.number}`}
                      </p>
                      {prog && !prog.watched ? (
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${Math.min(100, prog.pct)}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                    {prog?.watched ? (
                      <span className="shrink-0 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        ✓ VISTO
                      </span>
                    ) : null}
                    {active ? (
                      <span className="shrink-0 rounded bg-violet-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        TOCANDO
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {visible < list.length ? (
              <div className="flex justify-center pt-1">
                <button
                  onClick={() => setVisible((v) => v + EP_CHUNK)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Carregar mais ({list.length - visible} restantes)
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
