"use client";

// Aba "Downloads" — capítulos de mangá salvos no dispositivo (Cache API),
// agrupados por obra. Funciona 100% offline: a leitura vai direto do cache
// do service worker. Animes não entram aqui (HLS é streaming cross-origin;
// download de anime exigirá app nativo no futuro).

import { BookOpen, Download as DownloadIcon, Trash2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, removeChapter, useDownloads } from "@/lib/downloads";
import { Poster } from "./cards";
import type { Nav, StackItem } from "./types";

export function DownloadsView({ nav }: { nav: Nav }) {
  const { entries, progress } = useDownloads();

  // Agrupa por mangá
  const groups = new Map<
    string,
    { title: string; cover: string | null; items: typeof entries }
  >();
  for (const e of entries) {
    const g = groups.get(e.mangaId);
    if (g) g.items.push(e);
    else
      groups.set(e.mangaId, {
        title: e.mangaTitle,
        cover: e.mangaCoverUrl,
        items: [e],
      });
  }

  const runningIds = Object.keys(progress);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-emerald-600/15 p-2.5">
          <DownloadIcon className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold md:text-2xl">Downloads</h1>
          <p className="text-sm text-muted-foreground">
            {entries.length === 0
              ? "Nada baixado ainda"
              : `${entries.length} ${entries.length === 1 ? "capítulo" : "capítulos"} no dispositivo`}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/50" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Toque no botão de download ao lado de um capítulo na página de um
            mangá para salvá-lo aqui. Depois dá pra ler sem internet.
          </p>
          <button
            onClick={() => nav.push({ t: "mangas" })}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Explorar mangás
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groups.values()).map((g) => {
            const sorted = [...g.items].sort((a, b) => {
              const na = Number(a.chapterNumber) || 0;
              const nb = Number(b.chapterNumber) || 0;
              return na - nb;
            });
            return (
              <section
                key={g.title}
                className="rounded-2xl border border-border/60 bg-card/50 p-4"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="w-11 shrink-0 overflow-hidden rounded-lg">
                    <Poster
                      src={g.cover}
                      alt={g.title}
                      icon="manga"
                      className="aspect-[2/3] h-auto w-full"
                    />
                  </div>
                  <h2 className="min-w-0 flex-1 truncate text-base font-bold">
                    {g.title}
                  </h2>
                </div>
                <div className="space-y-2">
                  {sorted.map((c) => (
                    <div
                      key={c.chapterId}
                      className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.pageCount} págs · {formatBytes(c.sizeBytes)} ·{" "}
                          {c.lang}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const item: StackItem = {
                            t: "reader",
                            chapterId: c.chapterId,
                            chapterLabel: c.label,
                            mangaTitle: c.mangaTitle,
                            lang: c.lang,
                            chapters: sorted.map((x) => ({
                              id: x.chapterId,
                              chapter: x.chapterNumber,
                              title: null,
                            })),
                            index: sorted.findIndex(
                              (x) => x.chapterId === c.chapterId,
                            ),
                            mangaId: c.mangaId,
                            mangaCoverUrl: c.mangaCoverUrl,
                            chapterNumber: c.chapterNumber,
                          };
                          nav.push(item);
                        }}
                        className="rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                      >
                        Ler
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm(`Remover ${c.label}?`)) {
                            await removeChapter(c.chapterId);
                          }
                        }}
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-rose-500/60 hover:text-rose-400",
                        )}
                        aria-label={`Remover ${c.label} dos downloads`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          <p className="flex items-start gap-2 rounded-xl border border-border/50 bg-card/40 p-3 text-xs text-muted-foreground">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            Capítulos baixados abrem mesmo sem internet. Animes continuam como
            streaming (o download de vídeo exigirá o app nativo no futuro).
          </p>
        </div>
      )}

      {runningIds.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Baixando {runningIds.length}{" "}
          {runningIds.length === 1 ? "capítulo" : "capítulos"}…
        </p>
      ) : null}
    </div>
  );
}
