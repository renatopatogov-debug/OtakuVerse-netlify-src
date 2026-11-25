"use client";

import {
  Gamepad2,
  ExternalLink,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GameItem {
  id: string;
  title: string;
  category: "Jogo" | "RPG" | "Utilitário" | "Laboratório";
  badgeColor: string;
  icon: string;
  description: string;
  url: string;
}

const ARCADE_ITEMS: GameItem[] = [
  {
    id: "rogue-v2",
    title: "Roguelike RPG V2",
    category: "RPG",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: "🏥",
    description: "Terror psicológico e sobrevivência no asilo em pixel art. Cuidado com as sombras.",
    url: "/arcade/GAMES/ROGUELIKERPG/asylum_horror_enhanced/asylum_horror_enhanced.html",
  },
  {
    id: "rogue-ascii",
    title: "Roguelike RPG Clássico",
    category: "RPG",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: "🕯️",
    description: "Experiência imersiva de sobrevivência e terror em arte ASCII pura.",
    url: "/arcade/GAMES/ROGUELIKERPG/RPGROGUELIKE%201/RPGROGUELIKE.html",
  },
  {
    id: "spyfall",
    title: "Spyfall",
    category: "Jogo",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: "🕵️‍♂️",
    description: "O espião está entre nós! Faça perguntas, blefe e descubra-o antes que o tempo acabe.",
    url: "/arcade/GAMES/SPYFALLS/SPYFALLS1+1.html",
  },
  {
    id: "sueca",
    title: "Sueca",
    category: "Jogo",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: "🃏",
    description: "Estratégia, blefe e parceria no tradicional jogo de cartas em duplas.",
    url: "/arcade/GAMES/SUECATXT/PRJB20.html",
  },
  {
    id: "ghostchat",
    title: "GhostChat",
    category: "Utilitário",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: "👻",
    description: "Chat P2P anônimo direto entre navegadores. Crie seu apelido e conecte por chave aleatória.",
    url: "/arcade/GHOSTCHAT/GOHO1.html",
  },
  {
    id: "p2p",
    title: "Pure P2P Share",
    category: "Utilitário",
    badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    icon: "⚡",
    description: "Transferência direta de arquivos entre dispositivos via QR Code ou código temporário.",
    url: "/arcade/P2P/index.html",
  },
  {
    id: "nexus",
    title: "NEXUS",
    category: "Laboratório",
    badgeColor: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
    icon: "🧠",
    description: "Retrato psico-artístico interativo que mapeia seu olhar criativo e gera prompts de imagem.",
    url: "/arcade/TESTEIMAGEM/NEXUS.html",
  },
  {
    id: "acervo-pnp",
    title: "Acervo Print & Play",
    category: "Utilitário",
    badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    icon: "🎲",
    description: "Biblioteca de jogos de cartas e tabuleiro prontos para imprimir e jogar.",
    url: "/arcade/ACERVOGAMES/Acervogames.html",
  },
];

export function ArcadeView() {
  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Header da Seção */}
      <div className="mb-8 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-violet-700 shadow-md shadow-fuchsia-950/40">
            <Gamepad2 className="h-5 w-5 text-white" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-400">
            Acervo Integrado
          </span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Arcade & Laboratório
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Mini-games, jogos de cartas, RPGs de terror e experimentos P2P
          integrados com retorno direto ao Arcade e suporte offline após o primeiro acesso.
        </p>
      </div>

      {/* Grid de Cards dos Jogos */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {ARCADE_ITEMS.map((item) => (
          <div
            key={item.id}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-card/90 to-card/50 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-fuchsia-500/50 hover:shadow-lg hover:shadow-fuchsia-950/25"
          >
            <a
              href={item.url}
              className="flex flex-1 flex-col gap-3 focus-visible:outline-none"
            >
              <div className="flex items-center justify-between">
                <span className="text-4xl transition-transform duration-300 group-hover:scale-110">
                  {item.icon}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                    item.badgeColor,
                  )}
                >
                  {item.category}
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-foreground transition-colors group-hover:text-fuchsia-400">
                  {item.title}
                </h3>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </a>

            {/* Ações: Abrir integrado na aba atual ou em Nova Aba */}
            <div className="mt-6 flex items-center gap-2 border-t border-border/40 pt-3">
              <a
                href={item.url}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 py-2.5 text-center text-xs font-semibold text-white shadow transition-all hover:brightness-110 group-hover:shadow-fuchsia-950/40"
              >
                <span>Jogar / Abrir</span>
              </a>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-xl border border-border/70 bg-secondary/70 p-2.5 text-muted-foreground transition-colors hover:border-fuchsia-500/50 hover:bg-secondary hover:text-foreground"
                aria-label={`Abrir ${item.title} em nova aba`}
                title="Abrir em nova aba"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Card Informativo do Acervo */}
      <div className="mt-10 rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur-sm sm:flex sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-600/20 text-violet-400">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              Acesso Direto ao Acervo Clássico
            </h4>
            <p className="text-xs text-muted-foreground">
              Você também pode acessar a interface original estática do Acervo Digital.
            </p>
          </div>
        </div>
        <a
          href="/arcade/index.html"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-secondary px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80 sm:mt-0"
        >
          <span>Abrir Hub Clássico</span>
        </a>
      </div>
    </div>
  );
}
