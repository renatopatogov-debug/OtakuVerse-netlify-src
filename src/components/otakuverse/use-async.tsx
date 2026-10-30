"use client";

import { useEffect, useState } from "react";

/**
 * Hook de fetch com loading derivado da "key" do pedido.
 * - Sem setState síncrono no effect (compatível com react-hooks v6).
 * - Sem race conditions: apenas o pedido da key atual atualiza o estado
 *   (o cleanup invalida pedidos antigos).
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  key: string,
): { data: T | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });

  useEffect(() => {
    let alive = true;
    fn()
      .then((d) => {
        if (alive) setState({ key, data: d, error: null });
      })
      .catch((e) => {
        if (alive)
          setState({
            key,
            data: null,
            error:
              e instanceof Error ? e.message : "Erro inesperado ao carregar",
          });
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return {
    data: state.key === key ? state.data : null,
    loading: state.key !== key,
    error: state.key === key ? state.error : null,
  };
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json?.error) {
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  return json as T;
}

/**
 * Notas do AniList em lote para uma lista de animes do catálogo.
 * Enhancement silencioso: se falhar, devolve null e os cards ficam sem nota.
 * Limitado aos primeiros 24 itens (limite do endpoint batch).
 */
export function useAniListScores(
  items:
    | { id: string; name?: string | null; nameEn?: string | null }[]
    | null
    | undefined,
): Record<string, number | null> | null {
  const [state, setState] = useState<{
    key: string;
    scores: Record<string, number | null> | null;
  }>({ key: "", scores: null });
  const key = items && items.length > 0 ? items.map((i) => i.id).join(",") : "";

  useEffect(() => {
    const list = items;
    if (!list || list.length === 0) return;
    let alive = true;
    const titles = list
      .slice(0, 24)
      .map((i) => (i.nameEn || i.name || "").trim())
      .filter(Boolean);
    if (titles.length === 0) return;
    fetch("/api/anilist/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.results) return;
        const map: Record<string, number | null> = {};
        j.results.forEach(
          (s: number | null, idx: number) => {
            const it = list[idx];
            if (it) map[it.id] = s;
          },
        );
        setState({ key, scores: map });
      })
      .catch(() => {
        /* silencioso */
      });
    return () => {
      alive = false;
    };
  }, [key]);

  // Padrão derivado: enquanto a key não bate, sem dados (estado de loading).
  return state.key === key ? state.scores : null;
}
