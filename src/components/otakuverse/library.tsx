"use client";

// Componentes compartilhados da "biblioteca pessoal":
//   FavButton       → coração animado que salva/remove dos favoritos
//   AudioPrefToggle → seletor global Legendado/Dublado (persistido)
//   ResumeChip      → chip "Continuar EP N · 42%" nas páginas de detalhe

import { Heart, Play, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useFavorites,
  usePreferredAudio,
  type FavEntry,
  type WatchEntry,
  watchPercent,
} from "@/lib/local-store";

/* ---------- Botão de favorito ---------- */

export function FavButton({
  entry,
  className,
  size = "md",
}: {
  entry: Omit<FavEntry, "addedAt">;
  className?: string;
  size?: "md" | "lg";
}) {
  const { isFav, toggle } = useFavorites();
  const active = isFav(entry.key);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggle(entry);
      }}
      className={cn(
        "group/fav inline-flex items-center gap-1.5 rounded-full border backdrop-blur transition-all duration-200 active:scale-90",
        active
          ? "border-rose-500/60 bg-rose-950/50 text-rose-400"
          : "border-white/20 bg-black/40 text-muted-foreground hover:border-rose-500/40 hover:text-rose-300",
        size === "lg" ? "px-4 py-2 text-sm font-semibold" : "px-3 py-1.5 text-xs font-semibold",
        className,
      )}
      aria-pressed={active}
      aria-label={active ? `Remover ${entry.title} dos favoritos` : `Salvar ${entry.title} nos favoritos`}
      title={active ? "Nos seus favoritos — clique para remover" : "Salvar nos favoritos"}
    >
      <Heart
        className={cn(
          "transition-transform duration-300",
          size === "lg" ? "h-4.5 w-4.5" : "h-3.5 w-3.5",
          active ? "heart-pop scale-110" : "group-hover/fav:scale-110",
        )}
        fill={active ? "currentColor" : "none"}
      />
      {size === "lg" ? (active ? "Nos favoritos" : "Favoritar") : null}
    </button>
  );
}

/* ---------- Seletor Legendado / Dublado ---------- */

export type AudioFilter = "leg" | "dub";

export function AudioPrefToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [pref, setPref] = usePreferredAudio();

  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/70 p-1 backdrop-blur", className)}
      role="group"
      aria-label="Preferência de áudio (legendado ou dublado)"
    >
      <Volume2 className="mx-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {(
        [
          { key: "leg", label: "Legendado", short: "LEG", cls: "bg-emerald-600 text-white" },
          { key: "dub", label: "Dublado", short: "DUB", cls: "bg-fuchsia-600 text-white" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.key}
          onClick={() => setPref(pref === opt.key ? null : opt.key)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-bold transition-all duration-200",
            pref === opt.key
              ? `${opt.cls} shadow-md`
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={pref === opt.key}
          title={
            pref === opt.key
              ? "Preferência salva — clique para limpar"
              : `Preferir versão ${opt.label.toLowerCase()} quando disponível`
          }
        >
          {compact ? opt.short : opt.label}
        </button>
      ))}
    </div>
  );
}

/** Normaliza audioType ("dublado", "Dub", "legendado"...) para "dub"/"leg"/null. */
export function normalizeAudio(s?: string | null): AudioFilter | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("dub")) return "dub";
  if (t.includes("leg") || t.includes("sub")) return "leg";
  return null;
}

/** Escolhe o melhor match por preferência de áudio (dublado > legendado ou vice-versa). */
export function pickByAudioPref<T extends { category?: string | null }>(
  items: T[],
  pref: AudioFilter | null,
): T | null {
  if (items.length === 0) return null;
  if (!pref) return items[0];
  const want = pref === "dub" ? "dublado" : "legendado";
  return items.find((i) => i.category === want) ?? items[0];
}

/* ---------- Chip "Continuar" nas páginas de detalhe ---------- */

export function ResumeChip({
  entry,
  onResume,
  className,
}: {
  entry: WatchEntry;
  onResume: () => void;
  className?: string;
}) {
  const pct = watchPercent(entry);
  const label =
    entry.source === "manga"
      ? entry.episodeTitle ?? entry.lang ?? "continuar"
      : `EP ${entry.episodeNumber ?? "?"}`;

  return (
    <button
      onClick={onResume}
      className={cn(
        "resume-glow group inline-flex items-center gap-2 rounded-full border border-fuchsia-500/50 bg-gradient-to-r from-fuchsia-950/70 to-violet-950/70 px-3.5 py-1.5 text-xs font-semibold text-fuchsia-100 transition-transform hover:scale-[1.03] active:scale-95",
        className,
      )}
      title={`Retomar de onde parou${pct != null ? ` (${pct}%)` : ""}`}
    >
      <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
      Continuar {label}
      {pct != null ? <span className="text-fuchsia-300/80">· {pct}%</span> : null}
    </button>
  );
}
