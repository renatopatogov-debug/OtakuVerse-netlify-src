"use client";

// PWA do OtakuVerse:
//  - Registra o service worker (/sw.js) para funcionar offline no shell.
//  - Banner de instalação: usa o prompt nativo do Chrome/Android quando
//    disponível; no iOS ensina o caminho "Compartilhar → Adicionar à Tela
//    de Início". Não incomoda: só aparece quando faz sentido e, ao fechar,
//    fica quieto por 7 dias.

import { useCallback, useEffect, useState } from "react";
import { Download, Plus, Share2, Sparkles, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ov:pwa:dismissed";
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    // iPadOS 13+ se identifica como Mac
    (/Macintosh/i.test(window.navigator.userAgent) && "ontouchend" in document)
  );
}

export function PwaSetup() {
  const [deferred, setDeferred] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [installing, setInstalling] = useState(false);

  /* Service worker (modo dev usa query ?mode=dev → sem cache de /_next) */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const isDev = process.env.NODE_ENV !== "production";
    const url = isDev ? "/sw.js?mode=dev" : "/sw.js";
    navigator.serviceWorker.register(url).catch(() => {
      // sem SW o app continua funcionando online — falha silenciosa
    });
  }, []);

  /* Prompt de instalação nativo (Chrome/Edge/Android) */
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setShow(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /* Decide se o banner deve aparecer (standalone nunca mostra) */
  useEffect(() => {
    if (isStandalone()) return;
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      if (raw && Date.now() - Number(raw) < DISMISS_DAYS * 86_400_000) return;
    } catch {
      /* localStorage bloqueado — mostra normalmente */
    }
    setIos(isIOS());
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ok */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setShow(false);
        try {
          window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {
          /* ok */
        }
      }
    } finally {
      setInstalling(false);
      setDeferred(null);
    }
  }, [deferred]);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar o OtakuVerse"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md animate-fade-up sm:inset-x-auto sm:right-5"
    >
      <div className="relative overflow-hidden rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-950/95 via-violet-950/95 to-fuchsia-950/95 p-4 shadow-2xl shadow-fuchsia-950/60 backdrop-blur-md">
        {/* brilho decorativo */}
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-fuchsia-500/20 blur-2xl"
          aria-hidden
        />

        <button
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-full p-1 text-fuchsia-200/70 transition-colors hover:bg-white/10 hover:text-fuchsia-100"
          aria-label="Fechar aviso de instalação"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 shadow-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </span>

          <div className="min-w-0 flex-1 pr-4">
            <p className="text-sm font-bold text-fuchsia-50">
              Leve o OtakuVerse pra tela inicial
            </p>

            {ios ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs leading-relaxed text-fuchsia-100/85">
                No iPhone/iPad: toque em{" "}
                <Share2 className="inline h-3.5 w-3.5" aria-label="Compartilhar" />{" "}
                <b>Compartilhar</b> e depois{" "}
                <Plus className="inline h-3.5 w-3.5" aria-label="Adicionar" />{" "}
                <b>Adicionar à Tela de Início</b>.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-fuchsia-100/85">
                App de verdade, direto do navegador: tela cheia, ícone na sua
                home e abertura instantânea.
              </p>
            )}

            {deferred ? (
              <button
                onClick={install}
                disabled={installing}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-900/50 transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {installing ? "Instalando..." : "Instalar app"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
