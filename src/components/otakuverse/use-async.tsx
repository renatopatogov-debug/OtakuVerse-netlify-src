"use client";

import { useEffect, useState } from "react";

/**
 * Hook de fetch com loading derivado da "key" do pedido.
 * - Sem setState síncrono no effect (compatível com react-hooks v6).
 * - Sem race conditions: apenas o pedido da key atual atualiza o estado
 *   (o cleanup invalida pedidos antigos).
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  key: string,
): { data: T | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    fn(controller.signal)
      .then((d) => {
        if (alive && !controller.signal.aborted) {
          setState({ key, data: d, error: null });
        }
      })
      .catch((e) => {
        if (
          !alive ||
          controller.signal.aborted ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          return;
        }
        setState({
          key,
          data: null,
          error:
            e instanceof Error ? e.message : "Erro inesperado ao carregar",
        });
      });
    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    data: state.key === key ? state.data : null,
    loading: state.key !== key,
    error: state.key === key ? state.error : null,
  };
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  let json: { error?: unknown } | null = null;
  try {
    json = (await res.json()) as { error?: unknown };
  } catch {
    // Resposta não JSON (ex.: gateway timeout HTML)
  }
  if (!res.ok || json?.error) {
    throw new Error(
      typeof json?.error === "string" && json.error
        ? json.error
        : `HTTP ${res.status}`,
    );
  }
  return json as T;
}

/**
 * Notas do AniList em lote para uma lista de animes do catálogo.
 * Mantém cache cumulativo por ID (não pisca ao "Carregar mais" e busca
 * também os novos lotes 25+, em blocos de até 24 por requisição).
 */
export function useAniListScores(
  items:
    | { id: string; name?: string | null; nameEn?: string | null }[]
    | null
    | undefined,
): Record<string, number | null> | null {
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const key = items && items.length > 0 ? items.map((i) => i.id).join(",") : "";

  useEffect(() => {
    const list = items;
    if (!list || list.length === 0) return;
    const missing = list
      .filter((i) => !(i.id in scores))
      .map((i) => ({
        id: i.id,
        title: (i.nameEn || i.name || "").trim(),
      }))
      .filter((e) => e.title.length > 0);
    if (missing.length === 0) return;

    const controller = new AbortController();
    let alive = true;

    (async () => {
      for (let offset = 0; offset < missing.length; offset += 24) {
        if (!alive || controller.signal.aborted) break;
        const batch = missing.slice(offset, offset + 24);
        try {
          const r = await fetch("/api/anilist/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ titles: batch.map((e) => e.title) }),
            signal: controller.signal,
          });
          const j = await r.json();
          if (!alive || controller.signal.aborted || !Array.isArray(j?.results)) {
            continue;
          }
          const patch: Record<string, number | null> = {};
          (j.results as (number | null)[]).forEach((s, idx) => {
            const entry = batch[idx];
            if (entry) patch[entry.id] = s ?? null;
          });
          setScores((prev) => ({ ...prev, ...patch }));
        } catch {
          /* silencioso */
        }
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return Object.keys(scores).length > 0 ? scores : null;
}
