// Serves the project's files to the preview as if from a web server.
// - Android app: Capacitor's local server reads the files straight from storage.
// - Browser: the service worker answers /__preview__/... from a cache the app fills before each run.
import { Capacitor } from "@capacitor/core";
import type { FileStore } from "../files";
import { isNative } from "../native";

const CACHE = "tc-preview";

const MIME: Record<string, string> = {
  html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript", cjs: "text/javascript",
  json: "application/json", map: "application/json", txt: "text/plain", md: "text/markdown", csv: "text/csv", xml: "application/xml",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  ico: "image/x-icon", bmp: "image/bmp", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", wasm: "application/wasm", pdf: "application/pdf",
  py: "text/x-python", ts: "text/plain", wat: "text/plain",
};

export function mimeType(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  return type.startsWith("text/") || type.endsWith("json") || type.endsWith("xml") || type.includes("svg") ? `${type}; charset=utf-8` : type;
}

export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** What was put in the cache last time, to only copy changed files. */
const cached = new Map<string, number>();

/**
 * Makes the project's current files reachable and returns the base URL they are served from,
 * or null when nothing can serve them here (then only the page itself runs).
 */
export async function prepareFiles(files: FileStore): Promise<string | null> {
  await files.flush();
  if (isNative) {
    const uri = await files.ws.rootUri();
    return Capacitor.convertFileSrc(uri).replace(/\/?$/, "/");
  }
  if (!("serviceWorker" in navigator) || !("caches" in window)) return null;
  if (!navigator.serviceWorker.controller) {
    // A first visit: wait a moment for the service worker to take over.
    await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 1500))]);
    if (!navigator.serviceWorker.controller) return null;
  }
  const base = new URL("__preview__/", new URL(".", location.href)).href;
  const cache = await caches.open(CACHE);
  const present = new Set<string>();
  for (const f of files.files) {
    present.add(f.name);
    if (cached.get(f.name) === f.updated) continue;
    let body: BlobPart;
    if (f.binary) body = (await files.readBytes(f)) as BlobPart;
    else body = (await files.ensureContent(f.id))?.content ?? "";
    await cache.put(base + encodePath(f.name), new Response(body, { headers: { "Content-Type": mimeType(f.name), "Cache-Control": "no-store" } }));
    cached.set(f.name, f.updated);
  }
  for (const name of [...cached.keys()]) {
    if (present.has(name)) continue;
    await cache.delete(base + encodePath(name));
    cached.delete(name);
  }
  return base;
}
