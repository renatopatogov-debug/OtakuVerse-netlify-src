// Cliente server-side do AniSkip — tempos de abertura (OP) e encerramento (ED)
// por episódio, usando o MAL ID + número do episódio.
// Endpoint público: https://api.aniskip.com/v2/skip-times/{malId}/{episode}

export interface SkipInterval {
  startTime: number;
  endTime: number;
}

export interface SkipTimes {
  op: SkipInterval | null;
  ed: SkipInterval | null;
}

const TTL_DAYS = 7;
export const SKIP_TTL_MS = TTL_DAYS * 24 * 3600_000;

export async function fetchSkipTimes(
  malId: number,
  episode: number,
  episodeLength?: number,
): Promise<SkipTimes | null> {
  try {
    const types = "types=op&types=ed";
    const len = episodeLength && episodeLength > 0
      ? `&episodeLength=${Math.round(episodeLength)}`
      : "&episodeLength=1420";
    const res = await fetch(
      `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${types}${len}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      found?: boolean;
      results?: {
        interval: SkipInterval;
        skipType: string;
      }[];
    };
    if (!json.found || !json.results?.length) return null;
    const out: SkipTimes = { op: null, ed: null };
    for (const r of json.results) {
      if (r.skipType === "op") out.op = r.interval;
      else if (r.skipType === "ed") out.ed = r.interval;
    }
    if (!out.op && !out.ed) return null;
    return out;
  } catch {
    return null;
  }
}
