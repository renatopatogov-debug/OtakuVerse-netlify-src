"use client";

import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Acordeão por faixas: divide uma lista longa em grupos (ex. 50 caps) e
 * renderiza APENAS o grupo aberto. Listas de 1000+ itens (One Piece, OPM)
 * deixam de pesar o DOM e a página fica limpa e rápida.
 */
export function RangeAccordion({
  count,
  size,
  openIndex,
  onOpenChange,
  labelFor,
  unit,
  renderItem,
}: {
  count: number;
  size: number;
  openIndex: number | null;
  onOpenChange: (i: number | null) => void;
  /** Rótulo do grupo; recebe índices [start, end) da fatia. */
  labelFor: (start: number, end: number) => string;
  unit: string;
  renderItem: (start: number, end: number) => ReactNode;
}) {
  const groups = Math.max(1, Math.ceil(count / size));
  return (
    <div className="space-y-2">
      {Array.from({ length: groups }, (_, i) => {
        const start = i * size;
        const end = Math.min(start + size, count);
        const open = openIndex === i;
        return (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-border/60 bg-card/40"
          >
            <button
              onClick={() => onOpenChange(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
            >
              <span className="text-sm font-semibold">{labelFor(start, end)}</span>
              <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                {end - start} {unit}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    open && "rotate-180",
                  )}
                />
              </span>
            </button>
            {open ? (
              <div className="space-y-2 px-3 pb-3">{renderItem(start, end)}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Índice do grupo que contém o item alvo (ou fallback). */
export function groupOfIndex(
  index: number,
  size: number,
  fallback = 0,
): number {
  if (index < 0) return fallback;
  return Math.floor(index / size);
}
