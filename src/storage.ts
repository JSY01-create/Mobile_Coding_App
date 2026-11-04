// localStorage can be missing or throw (private mode, blocked storage).
// Keep an in-memory copy so the app still works for the session.
const memory = new Map<string, string>();

export function loadJSON<T>(key: string, fallback: T): T {
  let raw: string | null | undefined;
  try {
    raw = localStorage.getItem(key);
  } catch {
    raw = undefined;
  }
  if (raw == null) raw = memory.get(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    localStorage.setItem(key, raw);
  } catch {
    // Storage full or blocked: the in-memory copy still holds the data.
  }
}
