"use client";

import { useCallback, useState } from "react";
import { Header } from "@/components/otakuverse/header";
import { HomeView } from "@/components/otakuverse/home-view";
import { AnimeBrowser } from "@/components/otakuverse/anime-browser";
import { AnimeDetail } from "@/components/otakuverse/anime-detail";
import { FallbackDetail } from "@/components/otakuverse/fallback-detail";
import { SfhdDetail } from "@/components/otakuverse/sfhd-detail";
import { FavoritesView } from "@/components/otakuverse/favorites-view";
import { DownloadsView } from "@/components/otakuverse/downloads-view";
import { MangaBrowser } from "@/components/otakuverse/manga-browser";
import { MangaDetail } from "@/components/otakuverse/manga-detail";
import { Reader } from "@/components/otakuverse/reader";
import { SearchView } from "@/components/otakuverse/search-view";
import { ArcadeView } from "@/components/otakuverse/arcade-view";
import type { Nav, StackItem } from "@/components/otakuverse/types";

export default function Home() {
  const [stack, setStack] = useState<StackItem[]>([{ t: "home" }]);
  const current = stack[stack.length - 1];

  const push = useCallback((item: StackItem) => {
    setStack((prev) => {
      // Evita empilhar o mesmo item duas vezes seguidas
      const top = prev[prev.length - 1];
      if (top.t === item.t && JSON.stringify(top) === JSON.stringify(item)) {
        return prev;
      }
      return [...prev, item];
    });
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const replaceAll = useCallback((item: StackItem) => {
    setStack([item]);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const nav: Nav = {
    push,
    back,
    replaceAll,
    canBack: stack.length > 1,
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        current={current}
        canBack={nav.canBack}
        onBack={nav.back}
        onNavigate={replaceAll}
        onSearch={(q) => push({ t: "search", q })}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:py-8">
        {current.t === "home" ? <HomeView nav={nav} /> : null}
        {current.t === "animes" ? <AnimeBrowser nav={nav} /> : null}
        {current.t === "mangas" ? <MangaBrowser nav={nav} /> : null}
        {current.t === "favorites" ? <FavoritesView nav={nav} /> : null}
        {current.t === "downloads" ? <DownloadsView nav={nav} /> : null}
        {current.t === "arcade" ? <ArcadeView nav={nav} /> : null}
        {current.t === "search" ? <SearchView q={current.q} nav={nav} /> : null}
        {current.t === "anime-detail" ? (
          <AnimeDetail
            key={current.cid}
            cid={current.cid}
            nav={nav}
            epId={current.epId}
          />
        ) : null}
        {current.t === "fallback-detail" ? (
          <FallbackDetail
            key={current.slug}
            slug={current.slug}
            nav={nav}
            epId={current.epId}
          />
        ) : null}
        {current.t === "sfhd-detail" ? (
          <SfhdDetail
            key={current.seriesId}
            seriesId={current.seriesId}
            nav={nav}
            epId={current.epId}
          />
        ) : null}
        {current.t === "manga-detail" ? (
          <MangaDetail
            key={current.id}
            id={current.id}
            nav={nav}
            chapterId={current.chapterId}
          />
        ) : null}
        {current.t === "reader" ? <Reader key={current.chapterId} item={current} nav={nav} /> : null}
      </main>

      <footer className="mt-auto border-t border-border/60 bg-card/40">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-1.5 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
          <p className="text-xs font-semibold">
            <span className="bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
              OtakuVerse
            </span>{" "}
            — demo de integração anime + mangá
          </p>
          <p className="max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            Projeto educacional que consome as APIs públicas do MangaDex
            (mangás), Otakulogia (animes e streaming), AniList (metadados e
            notas), ani.zip (títulos pt-BR) e AniSkip (pular abertura), com
            fontes alternativas de catálogo (assistiranimesonline.net e
            animesonline.cloud e animesfhd.net com streaming HLS) caso a fonte
            primária saia do ar. Todo o
            conteúdo exibido pertence aos respectivos detentores de direitos
            autorais.
          </p>
        </div>
      </footer>
    </div>
  );
}
