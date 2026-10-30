"use client";

import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Clapperboard,
  Download as DownloadIcon,
  Gamepad2,
  Heart,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/lib/local-store";
import { useDownloads } from "@/lib/downloads";
import type { StackItem } from "./types";

export function Header({
  current,
  canBack,
  onBack,
  onNavigate,
  onSearch,
}: {
  current: StackItem;
  canBack: boolean;
  onBack: () => void;
  onNavigate: (item: StackItem) => void;
  onSearch: (q: string) => void;
}) {
  const [term, setTerm] = useState("");
  const { entries: favs } = useFavorites();
  const { entries: dls } = useDownloads();

  const active =
    current.t === "home"
      ? "home"
      : current.t === "animes" || current.t === "anime-detail"
        ? "animes"
        : current.t === "mangas" ||
            current.t === "manga-detail" ||
            current.t === "reader"
          ? "mangas"
          : current.t === "arcade" || current.t === "arcade-player"
            ? "arcade"
            : current.t === "favorites"
              ? "favorites"
              : current.t === "downloads"
                ? "downloads"
                : null;

  const tabs: { key: "home" | "animes" | "mangas" | "arcade" | "downloads"; label: string; item: StackItem }[] =
    [
      { key: "home", label: "Início", item: { t: "home" } },
      { key: "animes", label: "Animes", item: { t: "animes" } },
      { key: "mangas", label: "Mangás", item: { t: "mangas" } },
      { key: "arcade", label: "Arcade", item: { t: "arcade" } },
      { key: "downloads", label: "Downloads", item: { t: "downloads" } },
    ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
        {canBack ? (
          <button
            onClick={onBack}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}

        <button
          onClick={() => onNavigate({ t: "home" })}
          className="flex shrink-0 items-center gap-2"
          aria-label="OtakuVerse — Início"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-600 to-violet-700 shadow-md shadow-fuchsia-950/50">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="hidden text-lg font-extrabold tracking-tight sm:block">
            <span className="bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
              OtakuVerse
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onNavigate(tab.item)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active === tab.key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <form
          className="ml-auto flex w-full max-w-md items-center gap-2"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = term.trim();
            if (q) onSearch(q);
          }}
        >
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar animes e mangás..."
              className="h-10 w-full rounded-lg border border-input bg-card/70 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-fuchsia-500/70 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/70"
              aria-label="Buscar animes e mangás"
            />
          </div>

          {/* Downloads offline */}
          <button
            onClick={() => onNavigate({ t: "downloads" })}
            className={cn(
              "relative shrink-0 rounded-lg p-2 transition-colors",
              active === "downloads"
                ? "bg-secondary text-emerald-400"
                : "text-muted-foreground hover:bg-secondary hover:text-emerald-300",
            )}
            aria-label={`Downloads offline (${dls.length})`}
            title="Downloads offline"
          >
            <DownloadIcon className="h-5 w-5" />
            {dls.length > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white shadow">
                {dls.length > 99 ? "99+" : dls.length}
              </span>
            ) : null}
          </button>

          {/* Favoritos (biblioteca local do navegador) */}
          <button
            onClick={() => onNavigate({ t: "favorites" })}
            className={cn(
              "relative shrink-0 rounded-lg p-2 transition-colors",
              active === "favorites"
                ? "bg-secondary text-rose-400"
                : "text-muted-foreground hover:bg-secondary hover:text-rose-300",
            )}
            aria-label={`Meus favoritos (${favs.length})`}
            title="Meus favoritos"
          >
            <Heart
              className={cn(
                "h-5 w-5 transition-transform active:scale-90",
                favs.length > 0 && "heart-pop",
              )}
              fill={favs.length > 0 ? "currentColor" : "none"}
            />
            {favs.length > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white shadow">
                {favs.length > 99 ? "99+" : favs.length}
              </span>
            ) : null}
          </button>
        </form>
      </div>

      {/* Tabs mobile */}
      <nav className="flex border-t border-border/40 md:hidden" aria-label="Navegação mobile">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onNavigate(tab.item)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors",
              active === tab.key
                ? "border-b-2 border-fuchsia-500 text-foreground"
                : "text-muted-foreground",
            )}
          >
            {tab.key === "animes" ? (
              <Clapperboard className="h-4 w-4" />
            ) : tab.key === "mangas" ? (
              <BookOpen className="h-4 w-4" />
            ) : tab.key === "downloads" ? (
              <DownloadIcon className="h-4 w-4" />
            ) : null}
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
