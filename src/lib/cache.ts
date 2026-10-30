// Cache simples em memória com TTL, para aliviar as APIs upstream.
type Entry = { at: number; data: unknown };

const store = new Map<string, Entry>();
const MAX_ENTRIES = 400;

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) {
    return hit.data as T;
  }
  const data = await fn();
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { at: now, data });
  return data;
}
