import type { MetadataRoute } from "next";

// Manifest do PWA OtakuVerse — permite "Adicionar à tela inicial"
// no Android/Chrome (instalação standalone) e é a base para o iOS
// (que usa apple-touch-icon + appleWebApp do layout).

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OtakuVerse — Animes & Mangás",
    short_name: "OtakuVerse",
    description:
      "Assista animes e leia mangás em um só lugar: catálogo, episódios legendados/dublados, leitor de mangás, continuar assistindo e favoritos — tudo no seu navegador.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#09090b",
    theme_color: "#09090b",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["entertainment", "books"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
