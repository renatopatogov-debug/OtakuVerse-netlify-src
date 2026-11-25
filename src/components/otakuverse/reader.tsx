"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, WifiOff } from "lucide-react";
import { fetchJson, useAsync } from "./use-async";
import type { ChapterPages } from "@/lib/mangadex";
import type { Nav, StackItem } from "./types";
import { saveWatchProgress } from "@/lib/local-store";
import { getDownloadedPages } from "@/lib/downloads";
import { ChapterDlButton } from "./dl-button";

type ReaderItem = Extract<StackItem, { t: "reader" }>;

export function Reader({ item, nav }: { item: ReaderItem; nav: Nav }) {
  // Verifica imediatamente se o capítulo já foi salvo no cache offline
  // (evita depender do nó dinâmico ?b= do MangaDex ou piscar erro quando sem rede).
  const [cachedState, setCachedState] = useState<{
    chapterId: string;
    pages: string[] | null;
    checked: boolean;
  }>({ chapterId: item.chapterId, pages: null, checked: false });

  useEffect(() => {
    let alive = true;
    getDownloadedPages(item.chapterId).then((p) => {
      if (alive) {
        setCachedState({
          chapterId: item.chapterId,
          pages: p && p.length > 0 ? p : null,
          checked: true,
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [item.chapterId]);

  const offlinePages =
    cachedState.chapterId === item.chapterId ? cachedState.pages : null;
  const cacheChecked =
    cachedState.chapterId === item.chapterId ? cachedState.checked : false;

  const { data, loading: netLoading, error } = useAsync<ChapterPages>(
    (signal) =>
      fetchJson(
        `/api/manga/pages?chapterId=${encodeURIComponent(item.chapterId)}`,
        { signal },
      ),
    `pages:${item.chapterId}`,
  );
  const loading = !offlinePages && (netLoading || (Boolean(error) && !cacheChecked));

  // Rola para o topo ao abrir/trocar capítulo
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [item.chapterId]);

  // Registra o capítulo no histórico local (Continuar leitura)
  useEffect(() => {
    if (!item.mangaId) return;
    const historyLang =
      item.lang === "pt-br" ||
      item.lang === "en" ||
      item.lang === "es" ||
      item.lang === "es-la"
        ? item.lang
        : "en";
    saveWatchProgress({
      key: `mg:${item.mangaId}`,
      source: "manga",
      title: item.mangaTitle,
      posterUrl: item.mangaCoverUrl ?? null,
      mangaId: item.mangaId,
      episodeId: item.chapterId,
      episodeNumber:
        item.chapterNumber != null &&
        item.chapterNumber !== "" &&
        Number.isFinite(Number(item.chapterNumber))
          ? Number(item.chapterNumber)
          : null,
      episodeTitle: item.chapterLabel,
      lang: historyLang,
      position: 0,
      duration: 0,
    });
  }, [item.mangaId, item.chapterId, item.chapterLabel, item.chapterNumber, item.mangaTitle, item.mangaCoverUrl, item.lang]);

  // A lista `chapters` segue ordem decrescente (índice 0 = mais novo, fim = mais antigo).
  const canPrev = item.index < item.chapters.length - 1;
  const canNext = item.index > 0;

  // --- Gestos: swipe horizontal troca de capítulo ---
  // Esquerda = próximo capítulo (mais novo) · Direita = anterior (mais antigo).
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [swipeHint, setSwipeHint] = useState<"prev" | "next" | null>(null);
  const SWIPE_MIN = 80; // px horizontais mínimos

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = touchStart.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    if (dx < -SWIPE_MIN && canNext) setSwipeHint("next");
    else if (dx > SWIPE_MIN && canPrev) setSwipeHint("prev");
    else setSwipeHint(null);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    setSwipeHint(null);
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Só conta se for claramente horizontal (scroll vertical não dispara).
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && canNext) goRelative(-1);
    else if (dx > 0 && canPrev) goRelative(1);
  };

  // Prioriza as páginas salvas no cache offline (evita rebaixar quando o nó ?b= muda)
  const pages = offlinePages ?? data?.pages ?? null;

  const goRelative = (delta: number) => {
    const idx = item.index + delta;
    const target = item.chapters[idx];
    if (!target) return;
    nav.replaceCurrent({
      t: "reader",
      chapterId: target.id,
      chapterLabel: target.chapter ? `Cap. ${target.chapter}` : "Capítulo",
      mangaTitle: item.mangaTitle,
      lang: item.lang,
      chapters: item.chapters,
      index: idx,
      mangaId: item.mangaId,
      mangaCoverUrl: item.mangaCoverUrl,
      chapterNumber: target.chapter,
    });
  };

  return (
    <div className="space-y-4">
      {/* Barra do leitor (abaixo das 2 linhas do Header no mobile e 1 linha no desktop) */}
      <div className="sticky top-[98px] z-40 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/90 px-4 py-2.5 backdrop-blur sm:top-[102px] md:top-[65px]">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {item.mangaTitle}{" "}
          <span className="font-normal text-muted-foreground">
            — {item.chapterLabel}
          </span>
        </p>
        <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
          {item.lang}
        </span>
        {pages ? (
          <span className="text-xs text-muted-foreground">{pages.length} págs</span>
        ) : null}
        {!loading && pages && item.mangaId ? (
          <ChapterDlButton
            input={{
              chapterId: item.chapterId,
              mangaId: item.mangaId,
              mangaTitle: item.mangaTitle,
              mangaCoverUrl: item.mangaCoverUrl ?? null,
              chapterNumber: item.chapterNumber ?? null,
              label: item.chapterLabel,
              lang: item.lang,
            }}
          />
        ) : null}
        <div className="flex gap-1">
          <button
            onClick={() => goRelative(1)}
            disabled={!canPrev}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
            aria-label="Capítulo anterior (mais antigo)"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => goRelative(-1)}
            disabled={!canNext}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
            aria-label="Próximo capítulo (mais novo)"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      ) : error && !pages ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive">
          Falha ao carregar páginas: {error}
        </div>
      ) : (
        <>
          {error && pages ? (
            <p className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-2.5 text-center text-xs font-semibold text-emerald-300">
              <WifiOff className="h-3.5 w-3.5" />
              Sem internet — lendo do download salvo
            </p>
          ) : null}
          <div
            className="relative mx-auto max-w-3xl space-y-1 bg-black/50 py-1"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {(pages ?? []).map((src, i) => (
              <ReaderPage key={src + i} src={src} pageNum={i + 1} />
            ))}
            {swipeHint ? (
              <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
                <span className="flex items-center gap-1.5 rounded-full bg-black/80 px-4 py-2 text-xs font-semibold text-white shadow-lg">
                  {swipeHint === "next" ? (
                    <>
                      <ChevronRight className="h-4 w-4" /> Soltar = próximo
                      capítulo
                    </>
                  ) : (
                    <>
                      <ChevronLeft className="h-4 w-4" /> Soltar = capítulo
                      anterior
                    </>
                  )}
                </span>
              </div>
            ) : null}
          </div>
          {canNext ? (
            <div className="flex justify-center pb-4">
              <button
                onClick={() => goRelative(-1)}
                className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.03]"
              >
                Próximo capítulo →
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ReaderPage({ src, pageNum }: { src: string; pageNum: number }) {
  const [retryState, setRetryState] = useState<{
    src: string;
    nonce: number;
    failed: boolean;
  }>({ src, nonce: 0, failed: false });

  const isStale = retryState.src !== src;
  const failed = isStale ? false : retryState.failed;
  const nonce = isStale ? 0 : retryState.nonce;
  const currentSrc =
    nonce > 0
      ? `${src}${src.includes("?") ? "&" : "?"}retry=${nonce}`
      : src;

  return (
    <div className="relative flex min-h-[250px] w-full items-center justify-center bg-zinc-950/50">
      {failed ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground">
          <p>Não foi possível carregar a página {pageNum}.</p>
          <button
            onClick={() =>
              setRetryState({ src, nonce: Date.now(), failed: false })
            }
            className="mt-2.5 rounded-lg border border-border/70 bg-secondary/80 px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <img
          src={currentSrc}
          alt={`Página ${pageNum}`}
          loading={pageNum <= 2 ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setRetryState({ src, nonce, failed: true })}
          className="mx-auto block w-full select-none"
          draggable={false}
        />
      )}
    </div>
  );
}
