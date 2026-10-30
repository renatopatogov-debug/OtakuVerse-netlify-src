// Tipos de navegação compartilhados entre os componentes do OtakuVerse.

export type StackItem =
  | { t: "home" }
  | { t: "animes" }
  | { t: "mangas" }
  | { t: "favorites" }
  | { t: "downloads" }
  | { t: "arcade" }
  | { t: "arcade-player"; url: string; title: string }
  | { t: "search"; q: string }
  | { t: "anime-detail"; cid: number; epId?: string }
  | { t: "fallback-detail"; slug: string; epId?: string }
  | { t: "sfhd-detail"; seriesId: string; epId?: string }
  | { t: "manga-detail"; id: string; chapterId?: string }
  | {
      t: "reader";
      chapterId: string;
      chapterLabel: string;
      mangaTitle: string;
      lang: string;
      chapters: { id: string; chapter: string | null; title: string | null }[];
      index: number;
      /** Para o histórico "Continuar leitura" */
      mangaId?: string;
      mangaCoverUrl?: string | null;
      chapterNumber?: string | null;
    };

export interface Nav {
  push: (item: StackItem) => void;
  back: () => void;
  replaceAll: (item: StackItem) => void;
  canBack: boolean;
}
