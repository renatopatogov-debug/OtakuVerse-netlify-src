"use client";

// Player de vídeo HLS (m3u8) para as fontes do animesfhd.net.
// - Chrome/Firefox: hls.js (MediaSource Extensions), import dinâmico.
// - Safari: HLS nativo via video.src.
// - Fontes ordenadas por preferência; em erro fatal tenta a próxima uma
//   única vez antes de exibir o erro (evita loop).
// - Padrão key-derivado no estado: sem setState síncrono no effect
//   (compatível com react-hooks v6).

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, ServerCog, Wifi } from "lucide-react";

export interface PlayerSource {
  label: string;
  provider: string;
  playUrl: string;
  direct: boolean;
}

type PlayStatus = "loading" | "ready" | "error";

interface StatusState {
  key: string;
  value: PlayStatus;
  message?: string;
}

export function HlsPlayer({
  sources,
  initialIndex = 0,
  poster,
  subtitleVttUrl,
  title,
  onProgress,
  onEnded,
  startAt,
}: {
  sources: PlayerSource[];
  initialIndex?: number;
  poster?: string | null;
  subtitleVttUrl?: string | null;
  title: string;
  /** Progresso do vídeo (throttle interno de ~5s). Chamado no timeupdate. */
  onProgress?: (position: number, duration: number) => void;
  /** Vídeo terminou (marcar como assistido). */
  onEnded?: () => void;
  /** Segundo para onde pular assim que a duração estiver disponível. */
  startAt?: number;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [nonce, setNonce] = useState(0); // re-tentativas da mesma fonte
  const [status, setStatus] = useState<StatusState>({
    key: "",
    value: "loading",
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const failedRef = useRef<Set<string>>(new Set());
  const lastSaveRef = useRef(0);
  const seekedRef = useRef(false);

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v && startAt && startAt > 1 && !seekedRef.current) {
      if (v.duration > 0 && startAt < v.duration - 5) {
        v.currentTime = startAt;
        seekedRef.current = true;
      }
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !onProgress) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;
    if (v.duration > 0 && Number.isFinite(v.duration)) {
      onProgress(v.currentTime, v.duration);
    }
  };

  const src = sources[idx];
  const playUrl = src?.playUrl ?? "";
  // Chave de FALHA (sem nonce): usada pelo failover para marcar fontes mortas
  const failKey = `${idx}|${playUrl}`;
  // Chave de MONTAGEM (com nonce): remonta <video> também em re-tentativas
  const activeKey = `${nonce}|${failKey}`;
  const currentStatus: PlayStatus =
    status.key === activeKey ? status.value : "loading";

  const signature = useMemo(
    () => sources.map((s) => s.playUrl).join("|"),
    [sources],
  );

  useEffect(() => {
    failedRef.current = new Set();
  }, [signature]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playUrl) return;
    let destroyed = false;
    let hlsInstance: { destroy: () => void } | null = null;

    // Watchdog: se o vídeo não começou em 12s, trata como falha e pula
    // para a próxima fonte — independente do hls.js sinalizar erro ou não.
    const watchdog = setTimeout(() => {
      if (destroyed) return;
      const started = video.readyState >= 2 || video.currentTime > 0;
      if (started) return;
      failedRef.current.add(failKey);
      const next = sources.findIndex(
        (_, i) => !failedRef.current.has(`${i}|${sources[i].playUrl}`),
      );
      if (next >= 0) {
        setIdx(next);
      } else {
        setStatus({
          key: activeKey,
          value: "error",
          message:
            "Todas as fontes deste episódio falharam (os proxies do animesfhd podem estar fora do ar agora).",
        });
      }
    }, 12_000);

    (async () => {
      try {
        const isM3u8 = playUrl.includes(".m3u8") || playUrl.includes("m3u8");
        if (!isM3u8) {
          // Arquivo de vídeo direto (MP4/WebM) — reprodução nativa sem HLS parser
          video.src = playUrl;
          video.play().catch(() => {});
          return;
        }

        const mod = await import("hls.js");
        const HlsCtor = mod.default;
        if (destroyed) return;

        if (HlsCtor.isSupported()) {
          // Timeouts curtos: fontes proxy do animesfhd costumam falhar com
          // 502 — queremos detectar rápido e pular para a próxima fonte.
          const hls = new HlsCtor({
            enableWorker: true,
            manifestLoadingTimeOut: 10_000,
            manifestLoadingMaxRetry: 1,
            manifestLoadingRetryDelay: 500,
            levelLoadingTimeOut: 10_000,
            levelLoadingMaxRetry: 1,
            fragLoadingTimeOut: 20_000,
            fragLoadingMaxRetry: 2,
          });
          hlsInstance = hls;
          hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
            if (destroyed) return;
            const details = data.details ?? "";
            // Erros de MANIFEST disparam failover imediato — mesmo sem
            // fatal (o hls.js pode passar muito tempo re-tentando um 502
            // antes de declarar fatal, travando o player em "carregando").
            const manifestFail =
              details === "manifestLoadError" ||
              details === "manifestLoadTimeOut" ||
              details === "manifestParsingError" ||
              details === "manifestIncompatibleCodecsError";
            if (!manifestFail && !data.fatal) return;
            failedRef.current.add(failKey);
            const next = sources.findIndex(
              (_, i) => !failedRef.current.has(`${i}|${sources[i].playUrl}`),
            );
            if (next >= 0) {
              setIdx(next);
            } else {
              setStatus({
                key: activeKey,
                value: "error",
                message:
                  "Todas as fontes deste episódio falharam (os proxies do animesfhd podem estar fora do ar agora).",
              });
            }
          });
          hls.loadSource(playUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = playUrl; // HLS nativo (Safari)
        } else {
          setStatus({
            key: activeKey,
            value: "error",
            message: "Este navegador não suporta reprodução HLS.",
          });
        }
      } catch {
        if (!destroyed) {
          setStatus({
            key: activeKey,
            value: "error",
            message: "Falha ao inicializar o player de vídeo.",
          });
        }
      }
    })();

    return () => {
      destroyed = true;
      clearTimeout(watchdog);
      hlsInstance?.destroy();
      video.removeAttribute("src");
      video.load();
    };
    // playUrl/nonce mudam juntos na troca de episódio, fonte ou re-tentativa
  }, [playUrl, nonce]);

  if (sources.length === 0) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-border/60 bg-black text-sm text-muted-foreground">
        Nenhuma fonte de vídeo disponível para este episódio.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-black">
        <video
          ref={videoRef}
          key={activeKey}
          className="aspect-video w-full"
          controls
          autoPlay
          playsInline
          poster={poster ?? undefined}
          aria-label={`Player HLS — ${title}`}
          onTimeUpdate={handleTimeUpdate}
          onEnded={onEnded}
          onLoadedMetadata={handleLoadedMetadata}
          onPlaying={() =>
            setStatus({ key: activeKey, value: "ready" })
          }
          onError={() => {
            // erro do HLS nativo (Safari) — os erros do hls.js vêm no evento
            if (status.key === activeKey && status.value === "error") return;
            if (videoRef.current?.src) {
              setStatus({
                key: activeKey,
                value: "error",
                message: "Falha ao carregar o vídeo desta fonte.",
              });
            }
          }}
        >
          {subtitleVttUrl ? (
            <track
              kind="subtitles"
              src={subtitleVttUrl}
              srcLang="pt"
              label="Português"
              default
            />
          ) : null}
        </video>

        {currentStatus === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm text-white">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando vídeo...
            </div>
          </div>
        ) : null}
      </div>

      {/* Fontes: troca manual + honestidade sobre direto/proxy */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fonte:
        </span>
        {sources.map((s, i) => (
          <button
            key={`${i}|${s.playUrl}`}
            onClick={() => {
              if (i !== idx) setIdx(i);
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              i === idx
                ? "border-sky-500/70 bg-sky-950/50 text-sky-300"
                : "border-border/60 bg-card/60 text-muted-foreground hover:border-sky-500/40 hover:text-sky-300"
            }`}
            aria-label={`Trocar para ${s.label} (${s.provider})`}
          >
            {s.direct ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <ServerCog className="h-3 w-3" />
            )}
            {s.label} · {s.provider}
            {s.direct ? (
              <span className="text-[9px] uppercase text-emerald-400">
                direto
              </span>
            ) : null}
          </button>
        ))}
        {currentStatus === "error" ? (
          <button
            onClick={() => {
              failedRef.current.delete(failKey);
              setStatus({ key: "", value: "loading" });
              setNonce((n) => n + 1); // remonta o <video> e refaz o effect
            }}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/30 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-950/60"
          >
            <RefreshCw className="h-3 w-3" /> Tentar novamente
          </button>
        ) : null}
      </div>

      {currentStatus === "error" && status.key === activeKey ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {status.message ?? "Falha ao carregar o vídeo."} Os players proxy do
          animesfhd (AniStream/AniTube) ficam instáveis às vezes — tente outro
          episódio ou volte mais tarde.
        </p>
      ) : null}
    </div>
  );
}
