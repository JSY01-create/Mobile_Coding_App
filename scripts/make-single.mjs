// Turns the "single" build into one self-contained HTML file (used for the
// live preview). Inlines the script and stylesheet and drops the PWA tags.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "dist-single";
const html = readFileSync(join(dir, "index.html"), "utf8");

const scriptSrc = html.match(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/)?.[1];
const styleHref = html.match(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/)?.[1];
if (!scriptSrc || !styleHref) throw new Error("Could not find the built script or stylesheet");

const js = readFileSync(join(dir, scriptSrc), "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync(join(dir, styleHref), "utf8").replace(/<\/style/gi, "<\\/style");
const script = `<script type="module">${js}</script>`;
const style = `<style>${css}</style>`;

const head = html
  .match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<script type="module" crossorigin src="[^"]+"><\/script>\s*/, "")
  .replace(/<link rel="stylesheet" crossorigin href="[^"]+">\s*/, "")
  .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\s*/g, "")
  .replace(/<meta name="(apple-mobile-web-app-[^"]+|mobile-web-app-capable)"[^>]*>\s*/g, "");
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, "").trim();

// Full page for opening directly in a browser.
writeFileSync(join(dir, "thumbcode.html"), `<!doctype html>\n<html lang="en">\n<head>${head}${style}\n</head>\n<body>\n${body}\n${script}\n</body>\n</html>\n`);

// Body-only version for hosts that add their own <html>/<head>/<body> wrapper.
writeFileSync(join(dir, "embed.html"), `${title}\n${style}\n${body}\n${script}\n`);

console.log("wrote", join(dir, "thumbcode.html"), "and", join(dir, "embed.html"));
