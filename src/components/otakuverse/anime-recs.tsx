"use client";

import { fetchJson, useAsync } from "./use-async";
import { Poster } from "./cards";
import type { Nav } from "./types";

interface AniListRecItem {
  id: number;
  title: { romaji: string | null; english: string | null };
  coverImage: { large: string | null } | null;
  format: string | null;
  seasonYear: number | null;
}

export function AnimeRecs({
  name,
  nameEn,
  nav,
}: {
  name: string;
  nameEn?: string | null;
  nav: Nav;
}) {
  const { data, loading } = useAsync<{ items: AniListRecItem[] }>(
    (signal) =>
      fetchJson(
        `/api/anilist/recs?name=${encodeURIComponent(name)}${
          nameEn ? `&nameEn=${encodeURIComponent(nameEn)}` : ""
        }`,
        { signal },
      ),
    `anilist-recs:${name}`,
  );

  const items = data?.items ?? [];
  if (loading || items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Recomendados pra você</h2>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {items.map((m) => {
          const title = m.title.english ?? m.title.romaji ?? "Sem título";
          return (
            <button
              key={m.id}
              onClick={() => nav.push({ t: "search", q: title })}
              className="group w-28 shrink-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Buscar ${title} no catálogo`}
              title={`Buscar "${title}" no OtakuVerse`}
            >
              <div className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-fuchsia-500/60 group-hover:shadow-lg">
                <Poster
                  src={m.coverImage?.large ?? null}
                  alt={title}
                  icon="anime"
                  className="h-full w-full"
                />
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-medium leading-tight group-hover:text-fuchsia-300">
                {title}
              </p>
              {m.seasonYear ? (
                <p className="text-[11px] text-muted-foreground">
                  {m.seasonYear}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Toque em um título para buscar no catálogo do OtakuVerse.
      </p>
    </section>
  );
}
