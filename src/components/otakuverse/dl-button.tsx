"use client";

// Botão de download/remoção de capítulo com 3 estados:
//   idle      → ícone Download
//   rodando   → Loader girando + %
//   baixado   → Check (toque remove, com confirmação)
//   falhou    → TriangleAlert + retry no toque

import { useState } from "react";
import { CheckCircle2, Download, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  downloadChapter,
  removeChapter,
  useDownloads,
  type DownloadInput,
} from "@/lib/downloads";

export function ChapterDlButton({
  input,
  className,
}: {
  input: DownloadInput;
  className?: string;
}) {
  const { entries, progress } = useDownloads();
  const [failed, setFailed] = useState(false);
  const running = progress[input.chapterId];
  const downloaded = entries.some((e) => e.chapterId === input.chapterId);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (running) return;
    try {
      if (downloaded) {
        if (window.confirm("Remover este capítulo dos downloads?")) {
          await removeChapter(input.chapterId);
        }
      } else {
        setFailed(false);
        await downloadChapter(input);
      }
    } catch {
      setFailed(true);
    }
  };

  const pct =
    running && running.total > 0
      ? Math.round((running.done / running.total) * 100)
      : null;

  return (
    <button
      onClick={onClick}
      disabled={!!running}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
        downloaded
          ? "border-emerald-500/60 text-emerald-400 hover:bg-emerald-950/40"
          : failed
            ? "border-amber-500/60 text-amber-400 hover:bg-amber-950/40"
            : "border-border text-muted-foreground hover:border-emerald-500/60 hover:text-emerald-400",
        running && "cursor-wait opacity-80",
        className,
      )}
      aria-label={
        downloaded
          ? "Remover download"
          : running
            ? "Baixando capítulo"
            : "Baixar capítulo para leitura offline"
      }
      title={
        downloaded ? "Baixado — toque para remover" : "Baixar para ler offline"
      }
    >
      {running ? (
        pct !== null ? (
          <span className="text-[9px] font-bold tabular-nums">{pct}%</span>
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        )
      ) : downloaded ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : failed ? (
        <TriangleAlert className="h-4 w-4" />
      ) : (
        <Download className="h-4 w-4" />
      )}
    </button>
  );
}
