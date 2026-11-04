"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Play,
  Search,
} from "lucide-react";
import { fetchJson, useAsync } from "./use-async";
import { Poster, MangaCard } from "./cards";
import { FavButton, ResumeChip } from "./library";
import type { Nav } from "./types";
import { ChapterDlButton } from "./dl-button";
import type {
  MangaDetailResult,
  MangaItem,
  ChapterItem,
} from "@/lib/mangadex";
import { KAKA_PREFIX } from "@/lib/kakamanga";
import { useWatchHistory } from "@/lib/local-store";
import { cn } from "@/lib/utils";

const STATUS_PT: Record<string, string> = {
  ongoing: "Em andamento",
  completed: "Concluído",
  hiatus: "Em hiato",
  cancelled: "Cancelado",
};

const LANG_OPTIONS = [
  { key: "pt-br", label: "🇧🇷 Português" },
  { key: "en", label: "🇺🇸 Inglês" },
  { key: "es", label: "🇪🇸 Espanhol" },
];

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

  // Idioma selecionado (padrão: pt-br ou o último lido)
  const initialLang = lastRead?.lang === "en" ? "en" : "pt-br";
  const [selectedLang, setSelectedLang] = useState<string>(initialLang);

  // Busca inicial dos detalhes + capítulos APENAS do idioma selecionado
  const { data, loading, error } = useAsync<MangaDetailResult>(
    () => fetchJson(`/api/manga/detail?id=${id}&lang=${initialLang}`),
    `manga-detail:${id}:${initialLang}`,
  );

  // Cache no cliente dos capítulos por idioma para não sobrecarregar a API
  const [langChapters, setLangChapters] = useState<Record<string, ChapterItem[]>>({});
  const [loadingLang, setLoadingLang] = useState(false);

  // Reset de estado quando o id do mangá muda (evita reter dados de mangá anterior)
  useEffect(() => {
    setLangChapters({});
    setSelectedLang(initialLang);
  }, [id, initialLang]);

  // Registra os capítulos iniciais recebidos da primeira chamada
  useEffect(() => {
    if (!data?.chapters) return;
    const langKey = data.loadedLang || initialLang;
    setLangChapters((prev) => ({
      ...prev,
      [langKey]: data.chapters,
    }));
    if (data.loadedLang) {
      setSelectedLang(data.loadedLang);
    }
  }, [data]);

  // Carrega sob demanda APENAS o idioma selecionado quando o usuário troca de aba
  const handleSelectLang = async (lang: string) => {
    setSelectedLang(lang);
    if (langChapters[lang] !== undefined) return; // Já carregado

    setLoadingLang(true);
    try {
      const res = await fetchJson<{ chapters: ChapterItem[] }>(
        `/api/manga/chapters?id=${id}&lang=${lang}`,
      );
      setLangChapters((prev) => ({
        ...prev,
        [lang]: res.chapters ?? [],
      }));
    } catch {
      setLangChapters((prev) => ({
        ...prev,
        [lang]: [],
      }));
    } finally {
      setLoadingLang(false);
    }
  };

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
    const all = langChapters[selectedLang] ?? data.chapters ?? [];
    const item = readerItemFor(data, all, chapterId);
    if (item) {
      resumedRef.current = true;
      nav.push(item);
    }
  }, [chapterId, data, langChapters, selectedLang, nav]);

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
  const currentChapters = langChapters[selectedLang] ?? data.chapters ?? [];

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
                  const targetChapterId = lastRead.episodeId ?? "";
                  const item = readerItemFor(data, currentChapters, targetChapterId);
                  if (item) {
                    nav.push(item);
                  } else {
                    // Navega direto se o capítulo for de outro idioma ou ainda não listado
                    nav.push({
                      t: "reader",
                      chapterId: targetChapterId,
                      chapterLabel: lastRead.episodeTitle ?? "Capítulo",
                      mangaTitle: manga.title,
                      lang: lastRead.lang ?? "pt-br",
                      chapters: currentChapters.map((x) => ({
                        id: x.id,
                        chapter: x.chapter,
                        title: x.title,
                      })),
                      index: 0,
                      mangaId: id,
                      mangaCoverUrl: manga.coverUrl,
                      chapterNumber: lastRead.episodeNumber ? String(lastRead.episodeNumber) : null,
                    });
                  }
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

      {/* Seção de Capítulos Retrátil */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold">Capítulos</h2>
            {!loadingLang && currentChapters.length > 0 ? (
              <span className="rounded-full bg-secondary/80 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {currentChapters.length} {currentChapters.length === 1 ? "capítulo" : "capítulos"}
              </span>
            ) : null}
          </div>

          {/* Abas de Idioma — carrega APENAS o idioma selecionado */}
          <div className="flex gap-1 rounded-xl border border-border/50 bg-secondary/60 p-1">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleSelectLang(opt.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  selectedLang === opt.key
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loadingLang ? (
          <div className="flex justify-center rounded-2xl border border-border/60 bg-card/30 py-12">
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Carregando capítulos do idioma...</span>
            </div>
          </div>
        ) : currentChapters.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/30 py-12 text-center text-sm text-muted-foreground">
            <p>Nenhum capítulo disponível neste idioma para esta obra.</p>
            <p className="mt-1 text-xs opacity-75">Tente selecionar outro idioma nas abas acima.</p>
          </div>
        ) : (
          <CollapsibleChapterList
            chapters={currentChapters}
            lastReadId={lastRead?.episodeId ?? null}
            onSelectChapter={(targetId) => {
              const item = readerItemFor(data, currentChapters, targetId);
              if (item) nav.push(item);
            }}
            mangaId={id}
            mangaTitle={manga.title}
            mangaCoverUrl={manga.coverUrl}
          />
        )}
      </section>

      <MangaRecs id={id} nav={nav} />
    </div>
  );
}

/* ---------- Lista Retrátil Inteligente de Capítulos ---------- */

const GROUP_SIZE = 50;

function CollapsibleChapterList({
  chapters,
  lastReadId,
  onSelectChapter,
  mangaId,
  mangaTitle,
  mangaCoverUrl,
}: {
  chapters: ChapterItem[];
  lastReadId: string | null;
  onSelectChapter: (id: string) => void;
  mangaId: string;
  mangaTitle: string;
  mangaCoverUrl: string | null;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortAsc, setSortAsc] = useState(false); // false = mais recentes primeiro

  // Filtro e Ordenação Numérica Inteligente
  const processedChapters = useMemo(() => {
    let list = [...chapters];
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(
        (c) =>
          (c.chapter && c.chapter.toLowerCase().includes(q)) ||
          (c.title && c.title.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      const numA = a.chapter ? parseFloat(a.chapter) : 0;
      const numB = b.chapter ? parseFloat(b.chapter) : 0;
      if (isNaN(numA) || isNaN(numB)) return 0;
      return sortAsc ? numA - numB : numB - numA;
    });
    return list;
  }, [chapters, searchTerm, sortAsc]);

  // Se a lista filtrada tiver poucos itens (<= 15), exibe tudo sem agrupar
  const isShortList = processedChapters.length <= 15;

  // Divisão em grupos retráteis
  const groups = useMemo(() => {
    if (isShortList) return [];
    const count = processedChapters.length;
    const numGroups = Math.ceil(count / GROUP_SIZE);
    return Array.from({ length: numGroups }, (_, i) => {
      const start = i * GROUP_SIZE;
      const end = Math.min(start + GROUP_SIZE, count);
      const slice = processedChapters.slice(start, end);
      const firstCap = slice[0]?.chapter;
      const lastCap = slice[slice.length - 1]?.chapter;
      const label =
        firstCap && lastCap && firstCap !== lastCap
          ? `Capítulos ${lastCap} – ${firstCap}`
          : firstCap
            ? `Capítulo ${firstCap}`
            : `Capítulos ${start + 1} – ${end}`;
      return { id: i, label, slice, count: slice.length };
    });
  }, [processedChapters, isShortList]);

  // Controle de quais grupos estão abertos (o primeiro grupo ou o que tem o último lido vem aberto)
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({ 0: true });

  const toggleGroup = (groupId: number) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const expandAll = () => {
    const all: Record<number, boolean> = {};
    groups.forEach((g) => {
      all[g.id] = true;
    });
    setOpenGroups(all);
  };

  const collapseAll = () => {
    setOpenGroups({});
  };

  const renderSingleChapter = (c: ChapterItem) => (
    <div
      key={c.id}
      className="group flex w-full items-center gap-2 rounded-xl border border-border/50 bg-card/60 px-3.5 py-2.5 transition-all hover:border-emerald-500/60 hover:bg-secondary/60 hover:shadow-sm"
    >
      <button
        onClick={() => onSelectChapter(c.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <FileText className="h-4 w-4 shrink-0 text-emerald-400 group-hover:scale-110 transition-transform" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {c.chapter ? `Capítulo ${c.chapter}` : "Capítulo único"}
            {c.title ? ` — ${c.title}` : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {c.pages > 0 ? `${c.pages} págs · ` : ""}
            {formatDate(c.publishAt)}
            {c.group ? ` · ${c.group}` : ""}
          </p>
        </div>
        {lastReadId === c.id ? (
          <span className="flex shrink-0 items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
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
          mangaId,
          mangaTitle,
          mangaCoverUrl,
          chapterNumber: c.chapter,
          label: c.chapter ? `Cap. ${c.chapter}` : "Capítulo único",
          lang: c.lang,
        }}
        className="mr-1"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Barra de Ferramentas da Lista Retrátil */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-card/40 p-2.5">
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por capítulo (ex: 12)..."
            className="h-8 w-full rounded-lg border border-input/60 bg-background/80 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-secondary/50 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Alternar ordem de exibição"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>{sortAsc ? "Mais antigos" : "Mais recentes"}</span>
          </button>

          {!isShortList ? (
            <>
              <button
                onClick={expandAll}
                className="rounded-lg border border-border/60 bg-secondary/50 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Expandir Tudo
              </button>
              <button
                onClick={collapseAll}
                className="rounded-lg border border-border/60 bg-secondary/50 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Recolher Tudo
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Renderização Direta (se curta) ou Grupos Retráteis (se longa) */}
      {isShortList ? (
        <div className="space-y-1.5">
          {processedChapters.map(renderSingleChapter)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.map((group) => {
            const isOpen = !!openGroups[group.id];
            return (
              <div
                key={group.id}
                className="overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-all"
              >
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {group.label}
                    </span>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                      {group.count} caps
                    </span>
                  </div>

                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{isOpen ? "Recolher" : "Expandir"}</span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </span>
                </button>

                {isOpen ? (
                  <div className="space-y-1.5 border-t border-border/40 bg-background/30 p-3">
                    {group.slice.map(renderSingleChapter)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Recomendações (obras relacionadas no MangaDex) ---------- */

function MangaRecs({ id, nav }: { id: string; nav: Nav }) {
  const { data, loading } = useAsync<{ items: MangaItem[] }>(
    () => fetchJson(`/api/manga/recommendations?id=${id}`),
    `manga-recs:${id}`,
  );

  const items = data?.items ?? [];
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
