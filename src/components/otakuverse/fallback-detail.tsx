"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  PlayCircle,
  Star,
} from "lucide-react";
import { fetchJson, useAsync } from "./use-async";
import { GENRE_PT, Poster } from "./cards";
import { FavButton } from "./library";
import type { Nav } from "./types";
import {
  isWatched,
  saveWatchProgress,
  useWatchHistory,
  watchPercent,
} from "@/lib/local-store";

/* ---------- Tipos compartilhados com a lib ---------- */

export interface FallbackSearchItem {
  source: "anip" | "cloud" | "sfhd";
  slug: string;
  title: string;
  posterUrl: string | null;
  year: string | null;
  score: string | null;
  tmdbId: number | null;
  externalUrl: string | null;
}

interface FallbackDetailData {
  source: "anip";
  slug: string;
  title: string;
  synopsis: string | null;
  posterUrl: string | null;
  tmdbId: number | null;
  episodes: { number: number; title: string | null }[];
  anilist: {
    id: number;
    score: number | null;
    genres: string[];
    bannerImage: string | null;
  } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  anip: "assistiranimesonline.net",
  cloud: "animesonline.cloud",
  sfhd: "animesfhd.net (HLS)",
};

/* ---------- Card dos resultados alternativos ---------- */

function FallbackCard({
  item,
  onClick,
}: {
  item: FallbackSearchItem;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-amber-500/60 group-hover:shadow-lg group-hover:shadow-amber-950/40">
        <div className="aspect-[2/3] w-full">
          <Poster
            src={item.posterUrl}
            alt={item.title}
            icon="anime"
            className="h-full w-full"
          />
        </div>
        <span className="absolute left-1.5 top-1.5 rounded bg-amber-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {item.source === "anip"
            ? "FALLBACK"
            : item.source === "sfhd"
              ? "HLS"
              : "FONTES"}
        </span>
        {item.source === "sfhd" ? (
          <span className="absolute right-1.5 top-1.5 rounded bg-sky-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
            FHD
          </span>
        ) : null}
        {item.score ? (
          <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur">
            <Star className="h-2.5 w-2.5" fill="currentColor" />
            {item.score}
          </span>
        ) : null}
        {item.externalUrl ? (
          <span className="absolute right-1.5 top-1.5 rounded bg-black/70 p-1 text-amber-300">
            <ExternalLink className="h-3 w-3" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-tight text-foreground group-hover:text-amber-300">
        {item.title}
      </p>
      {item.year ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{item.year}</p>
      ) : null}
    </>
  );

  if (item.externalUrl) {
    return (
      <a
        href={item.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
        aria-label={`${item.title} (abrir na fonte ${SOURCE_LABEL[item.source]})`}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      onClick={onClick}
      className="group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      aria-label={`Ver ${item.title} (fonte alternativa)`}
    >
      {inner}
    </button>
  );
}

/* ---------- Seção de resultados alternativos ---------- */

/**
 * Montada só quando a busca primária (Otakulogia) falha ou não traz nada.
 * Fontes: assistiranimesonline.net (com vídeo via TMDB/myembed) e
 * animesonline.cloud (abre na fonte).
 */
export function FallbackSection({ q, nav }: { q: string; nav: Nav }) {
  const { data, loading, error } = useAsync<{ items: FallbackSearchItem[] }>(
    () =>
      fetchJson(
        `/api/anime/fallback-search?q=${encodeURIComponent(q)}`,
      ),
    `fallback-search:${q}`,
  );

  const items = data?.items ?? [];

  return (
    <section className="space-y-4 rounded-2xl border border-amber-500/25 bg-amber-950/10 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-bold">Resultados de fontes alternativas</h2>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        A fonte primária não respondeu com resultados para “{q}”. Itens{" "}
        <span className="font-semibold text-amber-300">FALLBACK</span> abrem
        aqui mesmo (assistiranimesonline.net com player próprio),{" "}
        <span className="font-semibold text-sky-300">HLS</span> também (animesfhd.net
        com streaming HLS e legendas) e os demais abrem na fonte original em
        nova aba.
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando fontes
          alternativas...
        </div>
      ) : error || items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          Nenhuma fonte alternativa encontrou resultados para “{q}”.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((it) => (
            <FallbackCard
              key={`${it.source}:${it.slug}`}
              item={it}
              onClick={
                it.source === "anip"
                  ? () => nav.push({ t: "fallback-detail", slug: it.slug })
                  : it.source === "sfhd"
                    ? () =>
                        nav.push({
                          t: "sfhd-detail",
                          seriesId: it.slug,
                        })
                    : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Detalhe da fonte alternativa (com player myembed) ---------- */

const EP_CHUNK = 120;

export function FallbackDetail({
  slug,
  nav,
  epId,
}: {
  slug: string;
  nav: Nav;
  epId?: string;
}) {
  const { data, loading, error } = useAsync<FallbackDetailData>(
    () =>
      fetchJson(
        `/api/anime/fallback-detail?slug=${encodeURIComponent(slug)}`,
      ),
    `fallback-detail:${slug}`,
  );
  // Retomada: epId é o número do episódio salvo no histórico
  const [selectedEp, setSelectedEp] = useState<number | null>(
    epId && /^\d+$/.test(epId) ? Number(epId) : null,
  );
  const [visible, setVisible] = useState(EP_CHUNK);
  const { entries: historyEntries } = useWatchHistory();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Falha ao carregar da fonte alternativa: {error ?? "não encontrado"}
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

  const ep = selectedEp ?? data.episodes[0]?.number ?? 1;
  const score10 =
    data.anilist?.score != null ? (data.anilist.score / 10).toFixed(1) : null;

  // Progresso local desta série (fallback: sem duração de vídeo — iframe)
  const progressByEp = new Map<
    number,
    { pct: number | null; watched: boolean }
  >();
  for (const e of historyEntries) {
    if (e.key.startsWith(`fb:${slug}:`) && e.episodeNumber != null) {
      progressByEp.set(Number(e.episodeNumber), {
        pct: watchPercent(e),
        watched: isWatched(e),
      });
    }
  }

  /** Registra o episódio no histórico (retomável pela home). */
  const trackEpisode = (n: number) => {
    saveWatchProgress({
      key: `fb:${slug}:${n}`,
      source: "fallback",
      title: data.title,
      posterUrl: data.posterUrl,
      slug,
      episodeId: String(n),
      episodeNumber: n,
      episodeTitle:
        data.episodes.find((e) => e.number === n)?.title ?? null,
      audio: null,
      position: 0,
      duration: 0,
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho com banner/poster */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60">
        {data.anilist?.bannerImage ? (
          <img
            src={data.anilist.bannerImage}
            alt=""
            className="h-40 w-full object-cover sm:h-56"
            loading="lazy"
          />
        ) : (
          <div className="h-28 w-full bg-gradient-to-r from-amber-950/60 via-zinc-900 to-fuchsia-950/60 sm:h-40" />
        )}
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
          <div className="-mt-16 w-28 shrink-0 sm:-mt-24 sm:w-36">
            <div className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-border/60 shadow-xl">
              <Poster
                src={data.posterUrl}
                alt={data.title}
                icon="anime"
                className="h-full w-full"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-amber-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                FONTE ALTERNATIVA
              </span>
              <span className="text-[11px] text-muted-foreground">
                assistiranimesonline.net
              </span>
              <FavButton
                entry={{
                  key: `fb:${data.slug}`,
                  kind: "anime",
                  title: data.title,
                  posterUrl: data.posterUrl,
                  slug: data.slug,
                  year: null,
                }}
              />
              {score10 ? (
                <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-amber-400">
                  <Star className="h-3 w-3" fill="currentColor" /> {score10}{" "}
                  <span className="font-normal text-muted-foreground">
                    (AniList)
                  </span>
                </span>
              ) : null}
            </div>
            <h1 className="text-2xl font-bold leading-tight">{data.title}</h1>
            {data.anilist?.genres?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {data.anilist.genres.slice(0, 6).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-border/60 bg-secondary/60 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {GENRE_PT[g] ?? g}
                  </span>
                ))}
              </div>
            ) : null}
            {data.synopsis ? (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {data.synopsis.slice(0, 400)}
                {(data.synopsis.length ?? 0) > 400 ? "..." : ""}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Player via myembed (construído com o TMDB ID do catálogo) */}
      {data.tmdbId ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <PlayCircle className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-bold">
              Episódio {ep}
              {data.episodes.find((e) => e.number === ep)?.title
                ? ` — ${data.episodes.find((e) => e.number === ep)?.title}`
                : ""}
            </h2>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-black">
            <iframe
              key={ep}
              src={`https://myembed.biz/serie/${data.tmdbId}/1/${ep}`}
              title={`Player alternativo — ${data.title} ep ${ep}`}
              allowFullScreen
              onLoad={() => trackEpisode(ep)}
              className="aspect-video w-full"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Player alternativo (myembed) construído a partir do TMDB ID{" "}
            {data.tmdbId}. Áudio, temporada e qualidade ficam nos menus internos
            do player. Se o episódio não bater na numeração, navegue pelos
            seletores do player.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          Vídeo indisponível nesta fonte alternativa (sem TMDB ID no catálogo).
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
                className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-950/60"
              >
                Mostrar mais ({data.episodes.length - visible} restantes)
              </button>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.episodes.slice(0, visible).map((e) => {
              const p = progressByEp.get(e.number);
              return (
                <button
                  key={e.number}
                  onClick={() => {
                    setSelectedEp(e.number);
                    trackEpisode(e.number);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                    e.number === ep
                      ? "border-amber-500/70 bg-amber-950/40"
                      : "border-border/60 bg-card/60 hover:border-amber-500/40 hover:bg-secondary/60"
                  }`}
                  aria-label={`Assistir episódio ${e.number}${e.title ? ` — ${e.title}` : ""}`}
                >
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-bold">
                    {e.number}
                    {p?.watched ? (
                      <CheckCircle2 className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-emerald-600 text-white" />
                    ) : null}
                  </span>
                  <span className="line-clamp-2 flex-1 text-xs leading-snug text-muted-foreground">
                    {e.title ?? `Episódio ${e.number}`}
                  </span>
                  {p && !p.watched && p.pct ? (
                    <span className="shrink-0 text-[9px] font-bold text-fuchsia-400">
                      {p.pct}%
                    </span>
                  ) : p?.watched ? (
                    <span className="shrink-0 text-[9px] font-bold uppercase text-emerald-400">
                      visto
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
