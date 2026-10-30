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
  const { data, loading, error } = useAsync<ChapterPages>(
    () => fetchJson(`/api/manga/pages?chapterId=${item.chapterId}`),
    `pages:${item.chapterId}`,
  );

  // Rola para o topo ao abrir/trocar capítulo
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [item.chapterId]);

  // Registra o capítulo no histórico local (Continuar leitura)
  useEffect(() => {
    if (!item.mangaId) return;
    saveWatchProgress({
      key: `mg:${item.mangaId}`,
      source: "manga",
      title: item.mangaTitle,
      posterUrl: item.mangaCoverUrl ?? null,
      mangaId: item.mangaId,
      episodeId: item.chapterId,
      episodeNumber: item.chapterNumber
        ? Math.floor(Number(item.chapterNumber)) || null
        : null,
      episodeTitle: item.chapterLabel,
      lang: item.lang === "pt-br" ? "pt-br" : "en",
      position: 0,
      duration: 0,
    });
  }, [item.mangaId, item.chapterId, item.chapterLabel, item.chapterNumber, item.mangaTitle, item.mangaCoverUrl, item.lang]);

  const canPrev = item.index > 0;
  const canNext = item.index < item.chapters.length - 1;

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

  // Fallback offline: se a rede falhar e o capítulo estiver baixado,
  // lê direto do cache do service worker.
  const [offlinePages, setOfflinePages] = useState<string[] | null>(null);
  useEffect(() => {
    if (!error) return;
    let alive = true;
    getDownloadedPages(item.chapterId).then((p) => {
      if (alive && p?.length) setOfflinePages(p);
    });
    return () => {
      alive = false;
    };
  }, [error, item.chapterId]);

  const pages = data?.pages ?? (error ? offlinePages : null);

  const goRelative = (delta: number) => {
    const idx = item.index + delta;
    const target = item.chapters[idx];
    if (!target) return;
    nav.push({
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
      {/* Barra do leitor */}
      <div className="sticky top-[57px] z-40 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/90 px-4 py-2.5 backdrop-blur md:top-[65px]">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {item.mangaTitle}{" "}
          <span className="font-normal text-muted-foreground">
            — {item.chapterLabel}
          </span>
        </p>
        <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
          {item.lang}
        </span>
        {data ? (
          <span className="text-xs text-muted-foreground">{data.total} págs</span>
        ) : null}
        {!error && !loading && data && item.mangaId ? (
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
              <img
                key={i}
                src={src}
                alt={`Página ${i + 1}`}
                loading={i < 2 ? "eager" : "lazy"}
                referrerPolicy="no-referrer"
                className="mx-auto block w-full select-none"
                draggable={false}
              />
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
