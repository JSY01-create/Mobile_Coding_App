import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";

// Files in /public that the service worker should keep offline.
const PUBLIC_ASSETS = [
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

// Writes sw.js with a precache list of every built file, so the app works offline.
function serviceWorker(): Plugin {
  return {
    name: "thumbcode-service-worker",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith(".map") && f !== "sw.js");
      const hash = createHash("sha256");
      for (const name of built) {
        const item = bundle[name];
        hash.update(name);
        hash.update(item.type === "chunk" ? item.code : String(item.source));
      }
      const version = hash.digest("hex").slice(0, 12);
      const assets = ["./", ...[...built, ...PUBLIC_ASSETS].map((f) => "./" + f)];
      const source = `// Generated at build time. Cache version ${version}.
const CACHE = "thumbcode-${version}";
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("thumbcode-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(caches.match("./", { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    base: "./",
    define: {
      __SINGLE_FILE__: JSON.stringify(single),
    },
    build: single
      ? {
          // One self-contained HTML file (used for the live preview).
          outDir: "dist-single",
          assetsInlineLimit: () => true,
          cssCodeSplit: false,
          modulePreload: false,
          copyPublicDir: false,
          rolldownOptions: { output: { inlineDynamicImports: true } },
        }
      : { outDir: "dist", target: "es2020" },
    plugins: single ? [] : [serviceWorker()],
  };
});
