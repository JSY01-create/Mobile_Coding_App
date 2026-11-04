// Colors: reading any CSS color and writing it back as hex, rgb() or hsl().

export interface RGBA {
  r: number;
  g: number;
  b: number;
  /** 0 to 1 */
  a: number;
}

export type ColorFormat = "hex" | "rgb" | "hsl";

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, RGBA | null>();

/** Any CSS color ("#0af", "rgb(1 2 3 / .5)", "rebeccapurple"...) as RGBA, or null. The browser does the parsing. */
export function parseColor(text: string): RGBA | null {
  const key = text.trim().toLowerCase();
  if (!key || key === "currentcolor" || /^(inherit|initial|unset|revert|none|auto)$/.test(key)) return null;
  if (cache.has(key)) return cache.get(key)!;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  // Canvas ignores values it can't read, so compare with two different starting colors.
  ctx.fillStyle = "#010203";
  ctx.fillStyle = key;
  const first = ctx.fillStyle;
  ctx.fillStyle = "#040506";
  ctx.fillStyle = key;
  const second = ctx.fillStyle;
  const result = first === second ? fromCanvas(String(first)) : null;
  cache.set(key, result);
  return result;
}

function fromCanvas(v: string): RGBA | null {
  if (v.startsWith("#")) {
    const n = parseInt(v.slice(1, 7), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

/** Which format a written color uses, to answer in the same one. */
export function formatOf(text: string): ColorFormat {
  const t = text.trim().toLowerCase();
  if (t.startsWith("rgb")) return "rgb";
  if (t.startsWith("hsl")) return "hsl";
  return "hex";
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");
const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return String(Math.round(n * f) / f);
};

export function formatColor(c: RGBA, format: ColorFormat, upper = false): string {
  const a = Math.round(c.a * 100) / 100;
  if (format === "rgb") {
    const rgb = `${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}`;
    return a < 1 ? `rgba(${rgb}, ${round(a)})` : `rgb(${rgb})`;
  }
  if (format === "hsl") {
    const { h, s, l } = rgbToHsl(c);
    const hsl = `${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
    return a < 1 ? `hsla(${hsl}, ${round(a)})` : `hsl(${hsl})`;
  }
  const hex = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${a < 1 ? hex2(a * 255) : ""}`;
  return upper ? hex.toUpperCase() : hex;
}

export function cssOf(c: RGBA): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`;
}

// ---- Conversions --------------------------------------------------------------------

export function rgbToHsv({ r, g, b }: RGBA): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return { r: f(5), g: f(3), b: f(1) };
}

export function rgbToHsl({ r, g, b }: RGBA): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h: rgbToHsv({ r: r * 255, g: g * 255, b: b * 255, a: 1 }).h, s, l };
}

/** Colors written in some text (hex, rgb(), hsl()), most used first. */
export function colorsIn(text: string, max = 12): string[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^()]*\)/gi)) {
    const c = parseColor(m[0]);
    if (!c) continue;
    const key = formatColor(c, "hex");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => k);
}
