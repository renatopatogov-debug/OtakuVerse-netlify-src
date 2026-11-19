"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
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

function stackItemToUrl(item: StackItem): string {
  const p = new URLSearchParams();
  switch (item.t) {
    case "home":
      break;
    case "animes":
      p.set("v", "animes");
      break;
    case "mangas":
      p.set("v", "mangas");
      break;
    case "favorites":
      p.set("v", "favorites");
      break;
    case "downloads":
      p.set("v", "downloads");
      break;
    case "arcade":
      p.set("v", "arcade");
      break;
    case "search":
      p.set("v", "search");
      if (item.q) p.set("q", item.q);
      break;
    case "anime-detail":
      p.set("v", "anime");
      p.set("cid", String(item.cid));
      if (item.epId) p.set("ep", item.epId);
      break;
    case "fallback-detail":
      p.set("v", "fallback");
      p.set("slug", item.slug);
      if (item.epId) p.set("ep", item.epId);
      break;
    case "sfhd-detail":
      p.set("v", "sfhd");
      p.set("sid", item.seriesId);
      if (item.epId) p.set("ep", item.epId);
      break;
    case "manga-detail":
      p.set("v", "manga");
      p.set("id", item.id);
      if (item.chapterId) p.set("ch", item.chapterId);
      break;
    case "reader":
      if (item.mangaId) {
        p.set("v", "manga");
        p.set("id", item.mangaId);
        p.set("ch", item.chapterId);
      } else {
        p.set("v", "mangas");
      }
      break;
  }
  const qs = p.toString();
  const base = typeof window !== "undefined" ? window.location.pathname : "/";
  return qs ? `${base}?${qs}` : base;
}

function urlToStackItem(params: URLSearchParams): StackItem | null {
  const v = params.get("v");
  if (!v) return { t: "home" };
  switch (v) {
    case "animes":
      return { t: "animes" };
    case "mangas":
      return { t: "mangas" };
    case "favorites":
      return { t: "favorites" };
    case "downloads":
      return { t: "downloads" };
    case "arcade":
      return { t: "arcade" };
    case "search": {
      const q = (params.get("q") ?? "").trim();
      return q ? { t: "search", q } : { t: "home" };
    }
    case "anime": {
      const cid = Number(params.get("cid"));
      if (!Number.isInteger(cid) || cid <= 0) return null;
      const epId = params.get("ep") ?? undefined;
      return epId ? { t: "anime-detail", cid, epId } : { t: "anime-detail", cid };
    }
    case "fallback": {
      const slug = (params.get("slug") ?? "").trim();
      if (!slug) return null;
      const epId = params.get("ep") ?? undefined;
      return epId
        ? { t: "fallback-detail", slug, epId }
        : { t: "fallback-detail", slug };
    }
    case "sfhd": {
      const seriesId = (params.get("sid") ?? "").trim();
      if (!seriesId) return null;
      const epId = params.get("ep") ?? undefined;
      return epId
        ? { t: "sfhd-detail", seriesId, epId }
        : { t: "sfhd-detail", seriesId };
    }
    case "manga": {
      const id = (params.get("id") ?? "").trim();
      if (!id) return null;
      const chapterId = params.get("ch") ?? undefined;
      return chapterId
        ? { t: "manga-detail", id, chapterId }
        : { t: "manga-detail", id };
    }
    default:
      return null;
  }
}

const SERVER_STACK: StackItem[] = [{ t: "home" }];
let navStack: StackItem[] | null = null;
let nextEntryId = 1;
const historySnapshots = new Map<number, StackItem[]>();
const navListeners = new Set<() => void>();

function saveSnapshot(id: number, stack: StackItem[]) {
  historySnapshots.set(id, stack);
  if (historySnapshots.size > 100) {
    const oldest = historySnapshots.keys().next().value;
    if (oldest !== undefined) historySnapshots.delete(oldest);
  }
}

function ensureInit(): StackItem[] {
  if (navStack) return navStack;
  const parsed =
    typeof window !== "undefined"
      ? urlToStackItem(new URLSearchParams(window.location.search))
      : null;
  navStack =
    parsed && parsed.t !== "home" ? [{ t: "home" }, parsed] : SERVER_STACK;
  saveSnapshot(0, navStack);
  return navStack;
}

function subscribeNav(cb: () => void): () => void {
  navListeners.add(cb);
  return () => {
    navListeners.delete(cb);
  };
}

function emitNav() {
  for (const cb of navListeners) cb();
}

function getNavSnapshot(): StackItem[] {
  return ensureInit();
}

function getServerNavSnapshot(): StackItem[] {
  return SERVER_STACK;
}

export default function Home() {
  const stack = useSyncExternalStore(
    subscribeNav,
    getNavSnapshot,
    getServerNavSnapshot,
  );
  const current = stack[stack.length - 1];

  useEffect(() => {
    const active = ensureInit();
    const stateObj = window.history.state as {
      otvId?: number;
      otvCanBack?: boolean;
    } | null;
    if (typeof stateObj?.otvId !== "number") {
      window.history.replaceState(
        { otvId: 0, otvCanBack: false },
        "",
        stackItemToUrl(active[active.length - 1]),
      );
    } else if (!historySnapshots.has(stateObj.otvId)) {
      saveSnapshot(stateObj.otvId, active);
    }

    const onPopState = (ev: PopStateEvent) => {
      const id = (ev.state as { otvId?: number } | null)?.otvId;
      if (typeof id === "number" && historySnapshots.has(id)) {
        navStack = historySnapshots.get(id)!;
      } else {
        const parsed = urlToStackItem(
          new URLSearchParams(window.location.search),
        );
        navStack =
          parsed && parsed.t !== "home" ? [{ t: "home" }, parsed] : SERVER_STACK;
        const freshId = nextEntryId++;
        saveSnapshot(freshId, navStack);
      }
      emitNav();
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const push = useCallback((item: StackItem) => {
    const prev = ensureInit();
    const top = prev[prev.length - 1];
    if (top.t === item.t && JSON.stringify(top) === JSON.stringify(item)) {
      return;
    }
    const next = [...prev, item];
    const id = nextEntryId++;
    navStack = next;
    saveSnapshot(id, next);
    window.history.pushState(
      { otvId: id, otvCanBack: true },
      "",
      stackItemToUrl(item),
    );
    emitNav();
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const back = useCallback(() => {
    const prev = ensureInit();
    if (prev.length <= 1) return;
    const stateObj = window.history.state as { otvCanBack?: boolean } | null;
    if (stateObj?.otvCanBack) {
      window.history.back();
      return;
    }
    const next = prev.slice(0, -1);
    const id = nextEntryId++;
    navStack = next;
    saveSnapshot(id, next);
    window.history.replaceState(
      { otvId: id, otvCanBack: false },
      "",
      stackItemToUrl(next[next.length - 1]),
    );
    emitNav();
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const replaceAll = useCallback((item: StackItem) => {
    const prev = ensureInit();
    const top = prev[prev.length - 1];
    if (
      prev.length === 1 &&
      top.t === item.t &&
      JSON.stringify(top) === JSON.stringify(item)
    ) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      return;
    }
    const next = [item];
    const id = nextEntryId++;
    navStack = next;
    saveSnapshot(id, next);
    window.history.pushState(
      { otvId: id, otvCanBack: false },
      "",
      stackItemToUrl(item),
    );
    emitNav();
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
        {current.t === "arcade" ? <ArcadeView /> : null}
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
