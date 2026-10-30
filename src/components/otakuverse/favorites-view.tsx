"use client";

// Página "Meus Favoritos" — animes e mangás salvos no navegador.
// Cards navegáveis com remoção direta e estado vazio charmoso.

import { BookOpen, Clapperboard, Heart, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavorites, type FavEntry } from "@/lib/local-store";
import { Poster } from "./cards";
import type { Nav, StackItem } from "./types";

function favTarget(f: FavEntry): StackItem | null {
  if (f.kind === "manga" && f.mangaId) return { t: "manga-detail", id: f.mangaId };
  if (f.cid != null) return { t: "anime-detail", cid: f.cid };
  if (f.seriesId) return { t: "sfhd-detail", seriesId: f.seriesId };
  if (f.slug) return { t: "fallback-detail", slug: f.slug };
  if (f.mangaId) return { t: "manga-detail", id: f.mangaId };
  return null;
}

const SOURCE_TAG: Record<string, { label: string; cls: string }> = {
  otakulogia: { label: "Otakulogia", cls: "bg-fuchsia-600/90" },
  sfhd: { label: "HLS · animesfhd", cls: "bg-sky-600/90" },
  fallback: { label: "Fonte alternativa", cls: "bg-amber-600/90" },
  manga: { label: "MangaDex", cls: "bg-emerald-600/90" },
};

function FavCard({ fav, nav }: { fav: FavEntry; nav: Nav }) {
  const { toggle } = useFavorites();
  const target = favTarget(fav);
  const tag = SOURCE_TAG[favKeySource(fav.key)];

  const inner = (
    <>
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-rose-500/60 group-hover:shadow-lg group-hover:shadow-rose-950/40">
        <div className="aspect-[2/3] w-full">
          <Poster
            src={fav.posterUrl}
            alt={fav.title}
            icon={fav.kind === "manga" ? "manga" : "anime"}
            className="h-full w-full"
          />
        </div>
        {tag ? (
          <span
            className={cn(
              "absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold text-white",
              tag.cls,
            )}
          >
            {tag.label}
          </span>
        ) : null}
        {fav.audioMix ? (
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            {fav.audioMix.toUpperCase().includes("DUB") ? (
              <span className="rounded bg-fuchsia-600/90 px-1 py-0.5 text-[9px] font-bold text-white">DUB</span>
            ) : null}
            {fav.audioMix.toUpperCase().includes("LEG") ? (
              <span className="rounded bg-emerald-600/90 px-1 py-0.5 text-[9px] font-bold text-white">LEG</span>
            ) : null}
          </div>
        ) : null}
        {/* Remover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle(fav);
          }}
          className="absolute right-1.5 bottom-1.5 rounded-full bg-black/70 p-1.5 text-white/70 opacity-0 backdrop-blur transition-all hover:bg-rose-950/90 hover:text-rose-300 group-hover:opacity-100"
          aria-label={`Remover ${fav.title} dos favoritos`}
          title="Remover dos favoritos"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-tight group-hover:text-rose-300">
        {fav.title}
      </p>
      {fav.year ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{fav.year}</p>
      ) : null}
    </>
  );

  if (!target) return <div className="group">{inner}</div>;

  // div com role=button (HTML não permite <button> dentro de <button>,
  // e o botão de remover é filho do card)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => nav.push({ ...target })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          nav.push({ ...target });
        }
      }}
      className="group w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
    >
      {inner}
    </div>
  );
}

/** A fonte está embutida no prefixo da key. */
function favKeySource(key: string): string {
  if (key.startsWith("ol:")) return "otakulogia";
  if (key.startsWith("sfhd:")) return "sfhd";
  if (key.startsWith("fb:")) return "fallback";
  if (key.startsWith("mg:")) return "manga";
  return "";
}

export function FavoritesView({ nav }: { nav: Nav }) {
  const { entries } = useFavorites();

  const animes = entries.filter((f) => f.kind === "anime");
  const mangas = entries.filter((f) => f.kind === "manga");

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <section className="relative overflow-hidden rounded-2xl border border-rose-500/25 bg-gradient-to-br from-rose-950/40 via-card to-card p-6 md:p-8 animate-fade-up">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-rose-500/10 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 shadow-lg shadow-rose-950/50">
            <Heart className="h-6 w-6 text-white" fill="currentColor" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold md:text-3xl">Meus Favoritos</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {entries.length === 0
                ? "Salve animes e mangás com o coração para vê-los aqui."
                : `${entries.length} ${entries.length === 1 ? "item salvo" : "itens salvos"} neste navegador · ${animes.length} animes · ${mangas.length} mangás`}
            </p>
          </div>
        </div>
      </section>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/70 py-16 text-center animate-fade-up">
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <Heart className="h-7 w-7 text-rose-400/70" />
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/10" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">Sua lista está vazia (por enquanto)</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Toque no coração em qualquer anime ou mangá para guardá-lo aqui —
              fica salvo neste navegador, sem login.
            </p>
          </div>
        </div>
      ) : (
        <>
          {animes.length > 0 ? (
            <section className="animate-fade-up">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <span className="text-fuchsia-400">
                  <Clapperboard className="h-5 w-5" />
                </span>
                Animes <span className="text-sm font-normal text-muted-foreground">({animes.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {animes.map((f) => (
                  <FavCard key={f.key} fav={f} nav={nav} />
                ))}
              </div>
            </section>
          ) : null}

          {mangas.length > 0 ? (
            <section className="animate-fade-up">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <span className="text-emerald-400">
                  <BookOpen className="h-5 w-5" />
                </span>
                Mangás <span className="text-sm font-normal text-muted-foreground">({mangas.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {mangas.map((f) => (
                  <FavCard key={f.key} fav={f} nav={nav} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
