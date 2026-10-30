"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, FileText, Loader2, Play } from "lucide-react";
import { fetchJson, useAsync } from "./use-async";
import { RangeAccordion, groupOfIndex } from "./collapsible-groups";
import { Poster, MangaCard } from "./cards";
import { FavButton, ResumeChip } from "./library";
import type { Nav } from "./types";
import { ChapterDlButton } from "./dl-button";
import type {
  MangaDetailResult,
  MangaItem,
  ChapterItem,
} from "@/lib/mangadex";
import { LANG_PRIORITY } from "@/lib/mangadex";
import { KAKA_PREFIX } from "@/lib/kakamanga";
import { useWatchHistory } from "@/lib/local-store";
import { cn } from "@/lib/utils";

const STATUS_PT: Record<string, string> = {
  ongoing: "Em andamento",
  completed: "Concluído",
  hiatus: "Em hiato",
  cancelled: "Cancelado",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}

export function MangaDetail({
  id,
  nav,
  chapterId,
}: {
  id: string;
  nav: Nav;
  chapterId?: string;
}) {
  const resumedRef = useRef(false);
  const { entries: historyEntries } = useWatchHistory();

  // Último capítulo lido deste mangá (chip "Continuar leitura")
  const lastRead = historyEntries.find((e) => e.key === `mg:${id}`) ?? null;

  // Idioma escolhido ANTES do carregamento: se já há progresso, retomamos
  // no idioma do último capítulo lido; senão pt-br. O servidor carrega
  // apenas esse idioma (séries longas como One Punch-Man têm 1900+ caps
  // somando tudo — por idioma cada lista cabe no feed).
  const initialLang = lastRead?.lang ?? "pt-br";
  const [lang, setLang] = useState<string>(initialLang);
  const { data, loading, error } = useAsync<MangaDetailResult>(
    () => fetchJson(`/api/manga/detail?id=${id}&lang=${initialLang}`),
    `manga-detail:${id}:${initialLang}`,
  );

  // Capítulos por idioma, carregados sob demanda (null = carregando).
  const [langChapters, setLangChapters] = useState<
    Record<string, ChapterItem[] | null>
  >({});

  // Registra o(s) idioma(s) que já vêm carregados do detail.
  useEffect(() => {
    if (!data) return;
    const k =
      data.source === "kakamanga"
        ? data.chapters[0]?.lang ?? "en"
        : data.loadedLang ?? "pt-br";
    setLangChapters((prev) =>
      prev[k] ? prev : { ...prev, [k]: data.chapters },
    );
  }, [data]);

  // Ao trocar de idioma, busca a lista se ainda não foi carregada.
  useEffect(() => {
    const totals = data?.langTotals;
    if (!totals) return;
    if ((totals[lang] ?? 0) <= 0) return;
    if (langChapters[lang] !== undefined) return;
    let alive = true;
    setLangChapters((prev) => ({ ...prev, [lang]: null }));
    fetchJson<{ chapters: ChapterItem[] }>(
      `/api/manga/chapters?id=${id}&lang=${lang}`,
    )
      .then((r) => {
        if (alive)
          setLangChapters((prev) => ({ ...prev, [lang]: r.chapters }));
      })
      .catch(() => {
        if (alive) setLangChapters((prev) => ({ ...prev, [lang]: [] }));
      });
    return () => {
      alive = false;
    };
    // langChapters não entra nas deps de propósito (evita refetch em loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, lang, id]);

  /** Monta o item do leitor a partir de um capítulo */
  const readerItemFor = (
    data: MangaDetailResult,
    chapters: MangaDetailResult["chapters"],
    targetId: string,
  ) => {
    const idx = chapters.findIndex((c) => c.id === targetId);
    if (idx < 0) return null;
    const c = chapters[idx];
    return {
      t: "reader" as const,
      chapterId: c.id,
      chapterLabel: c.chapter ? `Cap. ${c.chapter}` : "Capítulo",
      mangaTitle: data.manga.title,
      lang: c.lang,
      chapters: chapters.map((x) => ({
        id: x.id,
        chapter: x.chapter,
        title: x.title,
      })),
      index: idx,
      mangaId: id,
      mangaCoverUrl: data.manga.coverUrl,
      chapterNumber: c.chapter,
    };
  };

  // Retomada: deep-link do histórico abre direto o capítulo salvo
  useEffect(() => {
    if (resumedRef.current || !chapterId || !data) return;
    const all = [...data.chapters];
    const item = readerItemFor(data, all, chapterId);
    if (item) {
      resumedRef.current = true;
      nav.push(item);
    }
  }, [chapterId, data, nav]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm">Não foi possível carregar: {error}</p>
        <button
          onClick={nav.back}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
        >
          Voltar
        </button>
      </div>
    );
  }

  const { manga, author } = data;

  // Idiomas disponíveis: vem do langTotals (contagem por idioma no
  // servidor). Se a fonte for KakaManga (sem langTotals), deriva dos caps.
  const totals = data.langTotals ?? {};
  let availableLangs = LANG_PRIORITY.filter((l) => (totals[l] ?? 0) > 0);
  if (availableLangs.length === 0 && data.chapters.length > 0) {
    availableLangs = Array.from(new Set(data.chapters.map((c) => c.lang)));
  }

  // Idioma ativo: o escolhido se existe; senão o primeiro disponível.
  const activeLang: string =
    availableLangs.includes(lang) ? lang : availableLangs[0] ?? "pt-br";
  const langLoading = langChapters[activeLang] === null;
  const visibleChapters = langChapters[activeLang] ?? [];
  const langCount = (l: string): number =>
    langChapters[l]?.length ?? totals[l] ?? 0;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <section className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card/50 p-5 sm:flex-row md:p-8">
        <div className="w-32 shrink-0 self-start overflow-hidden rounded-xl shadow-2xl sm:w-40 md:w-48">
          <Poster
            src={manga.coverUrl}
            alt={manga.title}
            icon="manga"
            className="aspect-[2/3] h-auto w-full"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold leading-tight md:text-4xl">
            {manga.title}
          </h1>
          {author ? (
            <p className="mt-1 text-sm text-muted-foreground">por {author}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {manga.year ? (
              <span className="rounded bg-secondary px-2 py-1 font-medium">
                {manga.year}
              </span>
            ) : null}
            {manga.status ? (
              <span className="rounded bg-secondary px-2 py-1 font-medium">
                {STATUS_PT[manga.status] ?? manga.status}
              </span>
            ) : null}
            <span className="rounded bg-emerald-600/80 px-2 py-1 font-bold text-white">
              MangaDex
            </span>
            <FavButton
              entry={{
                key: `mg:${manga.id}`,
                kind: "manga",
                title: manga.title,
                posterUrl: manga.coverUrl,
                mangaId: manga.id,
                year: manga.year ?? null,
              }}
            />
          </div>
          {lastRead ? (
            <div className="mt-3">
              <ResumeChip
                entry={lastRead}
                onResume={() => {
                  const item = readerItemFor(data, data.chapters, lastRead.episodeId ?? "");
                  if (item) nav.push(item);
                }}
              />
            </div>
          ) : null}
          {manga.tags.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {manga.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {manga.description ? (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {manga.description.length > 700
                ? manga.description.slice(0, 700) + "…"
                : manga.description}
            </p>
          ) : null}
        </div>
      </section>

      {/* Capítulos */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="h-5 w-5 text-emerald-400" />
            Capítulos
          </h2>
          {availableLangs.length > 1 ? (
            <div className="flex gap-1 rounded-lg bg-secondary p-1">
              {availableLangs.map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-semibold transition-colors",
                    activeLang === l
                      ? "bg-emerald-600 text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l === "pt-br"
                    ? "🇧🇷 Português"
                    : l === "en"
                      ? "🇺🇸 Inglês"
                      : l === "es-la" || l === "es"
                        ? "🇪🇸 Espanhol"
                        : `🌐 ${l}`}
                  <span className="ml-1.5 opacity-70">
                    ({langCount(l)})
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {langLoading ? (
          <div className="flex justify-center rounded-xl border border-border/60 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : visibleChapters.length === 0 ? (
          <p className="rounded-xl border border-border/60 py-10 text-center text-sm text-muted-foreground">
            Nenhum capítulo disponível neste idioma.
          </p>
        ) : (
          <ChapterGroups
            key={activeLang}
            chapters={visibleChapters}
            lastReadId={lastRead?.episodeId ?? null}
            renderChapter={(c) => (
              <div
                key={c.id}
                className="flex w-full items-center gap-2 rounded-xl border border-border/60 px-4 py-3 transition-colors hover:border-emerald-500/60 hover:bg-secondary/50"
              >
                <button
                  onClick={() => {
                    const item = readerItemFor(data, visibleChapters, c.id);
                    if (item) nav.push(item);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.chapter ? `Capítulo ${c.chapter}` : "Capítulo único"}
                      {c.title ? ` — ${c.title}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.pages > 0 ? `${c.pages} págs · ` : ""}
                      {formatDate(c.publishAt)}
                      {c.group ? ` · ${c.group}` : ""}
                    </p>
                  </div>
                  {lastRead?.episodeId === c.id ? (
                    <span className="flex shrink-0 items-center gap-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      <Play className="h-2.5 w-2.5" fill="currentColor" /> LENDO
                    </span>
                  ) : null}
                  {c.id.startsWith(KAKA_PREFIX) ? (
                    <span className="shrink-0 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-400">
                      KakaManga
                    </span>
                  ) : null}
                  <span className="shrink-0 rounded bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                    {c.lang}
                  </span>
                </button>
                <ChapterDlButton
                  input={{
                    chapterId: c.id,
                    mangaId: id,
                    mangaTitle: manga.title,
                    mangaCoverUrl: manga.coverUrl,
                    chapterNumber: c.chapter,
                    label: c.chapter
                      ? `Cap. ${c.chapter}`
                      : "Capítulo único",
                    lang: c.lang,
                  }}
                  className="mr-1"
                />
              </div>
            )}
          />
        )}
      </section>

      <MangaRecs id={id} nav={nav} />
    </div>
  );
}

/* ---------- Lista retrátil de capítulos (grupos de 50) ---------- */

const CHAPTER_GROUP_SIZE = 50;

function chapterNum(c: ChapterItem): number | null {
  if (!c.chapter) return null;
  const n = parseFloat(c.chapter);
  return Number.isFinite(n) ? n : null;
}

function ChapterGroups({
  chapters,
  lastReadId,
  renderChapter,
}: {
  chapters: ChapterItem[];
  lastReadId: string | null;
  renderChapter: (c: ChapterItem) => React.ReactNode;
}) {
  // Abre por padrão o grupo do último capítulo lido (ou o mais recente).
  const initial = groupOfIndex(
    lastReadId ? chapters.findIndex((c) => c.id === lastReadId) : -1,
    CHAPTER_GROUP_SIZE,
    0,
  );
  const [openGroup, setOpenGroup] = useState<number | null>(initial);

  return (
    <RangeAccordion
      count={chapters.length}
      size={CHAPTER_GROUP_SIZE}
      openIndex={openGroup}
      onOpenChange={setOpenGroup}
      unit="caps"
      labelFor={(s, e) => {
        // Lista em ordem desc: primeiro item da fatia é o cap. mais alto.
        const hi = chapterNum(chapters[s]);
        const lo = chapterNum(chapters[e - 1]);
        if (hi != null && lo != null) {
          return hi === lo
            ? `Capítulo ${hi}`
            : `Capítulos ${Math.min(hi, lo)} – ${Math.max(hi, lo)}`;
        }
        return `Capítulos ${s + 1} – ${e}`;
      }}
      renderItem={(s, e) => <>{chapters.slice(s, e).map(renderChapter)}</>}
    />
  );
}

/* ---------- Recomendações (obras relacionadas no MangaDex) ---------- */

function MangaRecs({ id, nav }: { id: string; nav: Nav }) {
  const { data, loading } = useAsync<{ items: MangaItem[] }>(
    () => fetchJson(`/api/manga/recommendations?id=${id}`),
    `manga-recs:${id}`,
  );

  const items = data?.items ?? [];
  // Não ocupa espaço enquanto carrega nem quando não há relacionadas.
  if (loading || items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Relacionados</h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((m) => (
          <MangaCard
            key={m.id}
            manga={{
              id: m.id,
              title: m.title,
              year: m.year ?? null,
              status: m.status ?? null,
              coverUrl: m.coverUrl,
            }}
            onClick={() => nav.push({ t: "manga-detail", id: m.id })}
          />
        ))}
      </div>
    </section>
  );
}
