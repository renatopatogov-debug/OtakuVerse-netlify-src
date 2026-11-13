import { NextResponse } from "next/server";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function isSafePathSegment(seg: string): boolean {
  if (!seg || seg === "." || seg === "..") return false;
  if (seg.includes("\\") || seg.includes("?") || seg.includes("#")) return false;
  for (let i = 0; i < seg.length; i++) {
    const code = seg.charCodeAt(i);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

export function isSafeImageContentType(rawType: string | null): boolean {
  const mime = (rawType ?? "").split(";")[0].trim().toLowerCase();
  if (!mime) return true;
  if (
    mime === "image/svg+xml" ||
    mime.includes("html") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime.startsWith("text/")
  ) {
    return false;
  }
  return (
    mime.startsWith("image/") ||
    mime === "application/octet-stream" ||
    mime === "binary/octet-stream"
  );
}

export async function validateImageUpstream(
  res: Response,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const rawLen = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(rawLen) && rawLen > MAX_IMAGE_BYTES) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, status: 413, error: "Imagem excede o limite permitido" };
  }
  if (!isSafeImageContentType(res.headers.get("content-type"))) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, status: 502, error: "Tipo de conteúdo de imagem inválido" };
  }
  return { ok: true };
}

export async function streamImageProxyResponse(
  res: Response,
  headers: Record<string, string>,
  fallbackContentType = "image/jpeg",
): Promise<NextResponse> {
  const check = await validateImageUpstream(res);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }
  const contentType = res.headers.get("content-type") || fallbackContentType;
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      ...headers,
    },
  });
}
