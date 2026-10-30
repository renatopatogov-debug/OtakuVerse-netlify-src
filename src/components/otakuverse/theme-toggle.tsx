"use client";

// Toggle de tema claro/escuro do OtakuVerse.
// - O tema inicial é aplicado ANTES da pintura pelo script inline no layout
//   (evita flash branco) usando a chave "otv:theme";
//   sem preferência salva, segue o sistema; sem sistema, escuro.
// - Este botão alterna a classe `.dark` no <html>, persiste a escolha e
//   atualiza o color-scheme (scrollbars, inputs nativos etc.).

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_KEY = "otv:theme";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeToggle({ className }: { className?: string }) {
  // null = ainda não sabemos (evita mismatch de hidratação)
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.classList.contains("dark") ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* modo privado — segue sem persistir */
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-amber-300",
        className,
      )}
      aria-label={
        theme === "light" ? "Mudar para modo escuro" : "Mudar para modo claro"
      }
      title={theme === "light" ? "Modo escuro" : "Modo claro"}
      aria-pressed={theme === "light"}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </button>
  );
}
