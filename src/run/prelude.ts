// Runs first inside every preview page. It is turned into source text, so it must not use
// anything from outside the function.

/** A value from the page, packaged so the console can show it (and expand objects). */
export type Wire =
  | { t: "str" | "num" | "bool" | "big" | "sym" | "fn" | "date" | "re" | "node" | "more"; v: string }
  | { t: "null" | "undef" | "circ" }
  | { t: "err"; v: string; stack: string }
  | { t: "arr" | "set"; n: number; items: Wire[] }
  | { t: "map"; n: number; items: [Wire, Wire][] }
  | { t: "obj"; name: string; entries: [string, Wire][]; more: number };

export interface FromPage {
  __tc: 1;
  type: "log" | "error" | "clear" | "result" | "navigate" | "ready" | "done";
  level?: "log" | "info" | "warn" | "error" | "debug";
  args?: Wire[];
  message?: string;
  file?: string;
  line?: number;
  col?: number;
  stack?: string;
  id?: number;
  value?: Wire;
  error?: Wire;
  path?: string;
}

function prelude(root: string, pageName: string, lineOffset: number): void {
  const post = (msg: Record<string, unknown>) => {
    try {
      parent.postMessage({ __tc: 1, ...msg }, "*");
    } catch {
      // The console is closed.
    }
  };

  const ser = (v: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown => {
    const t = typeof v;
    if (v === null) return { t: "null" };
    if (t === "undefined") return { t: "undef" };
    if (t === "string") {
      const s = v as string;
      return { t: "str", v: s.length > 20000 ? s.slice(0, 20000) + "…" : s };
    }
    if (t === "number") return { t: "num", v: Object.is(v, -0) ? "-0" : String(v) };
    if (t === "boolean") return { t: "bool", v: String(v) };
    if (t === "bigint") return { t: "big", v: `${v}n` };
    if (t === "symbol") return { t: "sym", v: String(v) };
    if (t === "function") return { t: "fn", v: `ƒ ${(v as { name?: string }).name || "anonymous"}()` };
    const o = v as object;
    if (o instanceof Error) return { t: "err", v: `${o.name}: ${o.message}`, stack: String(o.stack || "") };
    if (typeof Node !== "undefined" && o instanceof Node) {
      const el = o as Element;
      if (el.nodeType === 1) {
        const id = el.id ? `#${el.id}` : "";
        const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "";
        return { t: "node", v: `<${el.tagName.toLowerCase()}${id}${cls}>` };
      }
      return { t: "node", v: o.nodeName };
    }
    if (o instanceof Date) return { t: "date", v: isNaN(+o) ? "Invalid Date" : o.toISOString() };
    if (o instanceof RegExp) return { t: "re", v: String(o) };
    if (seen.has(o)) return { t: "circ" };
    if (depth > 5) return { t: "more", v: Array.isArray(o) ? `Array(${o.length})` : (o.constructor && o.constructor.name) || "Object" };
    seen.add(o);
    if (Array.isArray(o)) return { t: "arr", n: o.length, items: o.slice(0, 200).map((x) => ser(x, depth + 1, seen)) };
    if (o instanceof Map) return { t: "map", n: o.size, items: [...o].slice(0, 200).map(([k, x]) => [ser(k, depth + 1, seen), ser(x, depth + 1, seen)]) };
    if (o instanceof Set) return { t: "set", n: o.size, items: [...o].slice(0, 200).map((x) => ser(x, depth + 1, seen)) };
    const ctor = (o as { constructor?: { name?: string } }).constructor;
    const name = ctor && ctor !== Object && ctor.name ? ctor.name : "";
    let keys: string[] = [];
    try {
      keys = Object.keys(o);
    } catch {
      keys = [];
    }
    const entries = keys.slice(0, 200).map((k) => {
      let val: unknown;
      try {
        val = (o as Record<string, unknown>)[k];
      } catch (e) {
        val = e;
      }
      return [k, ser(val, depth + 1, seen)];
    });
    return { t: "obj", name: name || (o instanceof Promise ? "Promise" : ""), entries, more: Math.max(0, keys.length - 200) };
  };

  const c = console as unknown as Record<string, (...a: unknown[]) => void>;
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const orig = c[level];
    c[level] = function (...args: unknown[]) {
      post({ type: "log", level, args: args.map((a) => ser(a)) });
      return orig.apply(console, args);
    };
  }
  const origClear = console.clear;
  console.clear = () => {
    post({ type: "clear" });
    origClear.call(console);
  };
  c.table = c.log;
  c.dir = c.log;
  c.trace = (...args: unknown[]) => c.log(...args, new Error("console.trace").stack);
  console.assert = (cond?: boolean, ...args: unknown[]) => {
    if (!cond) c.error("Assertion failed:", ...args);
  };
  const counts: Record<string, number> = {};
  console.count = (label = "default") => c.log(`${label}: ${(counts[label] = (counts[label] || 0) + 1)}`);
  const timers: Record<string, number> = {};
  console.time = (label = "default") => void (timers[label] = performance.now());
  console.timeEnd = (label = "default") => {
    if (timers[label] === undefined) return;
    c.log(`${label}: ${(performance.now() - timers[label]).toFixed(1)} ms`);
    delete timers[label];
  };

  const where = (url: string) => (url.startsWith(root) ? decodeURIComponent(url.slice(root.length)) : !url || url === "about:srcdoc" ? pageName : url);

  window.addEventListener(
    "error",
    (e) => {
      const target = e.target as (HTMLElement & { src?: string; href?: string }) | null;
      if (target && target !== (window as unknown) && (target.src || target.href)) {
        // An image, script or stylesheet that didn't load.
        post({ type: "error", message: `Couldn't load ${where(target.src || target.href || "")} (<${target.tagName.toLowerCase()}>)` });
        return;
      }
      const ev = e as ErrorEvent;
      post({
        type: "error",
        message: ev.message || "Error",
        file: where(ev.filename || ""),
        // Lines in the page itself are shifted by this script; take that back out.
        line: !ev.filename || ev.filename === "about:srcdoc" ? Math.max(1, ev.lineno - lineOffset) : ev.lineno,
        col: ev.colno,
        stack: ev.error && ev.error.stack ? String(ev.error.stack) : "",
      });
    },
    true
  );
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    post({ type: "error", message: `Uncaught (in promise) ${r && r.message ? r.message : String(r)}`, stack: r && r.stack ? r.stack : "" });
  });

  // Commands typed into the console run here.
  window.addEventListener("message", async (e) => {
    const d = e.data as { __tc?: number; type?: string; code?: string; id?: number };
    if (!d || d.__tc !== 2 || d.type !== "eval") return;
    try {
      let r: unknown = (0, eval)(d.code || "");
      if (r && typeof (r as Promise<unknown>).then === "function") r = await r;
      post({ type: "result", id: d.id, value: ser(r) });
    } catch (err) {
      post({ type: "result", id: d.id, error: ser(err) });
    }
  });

  // Links to other pages of the project open in the preview, with the console still attached.
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented) return;
      const url = new URL(a.getAttribute("href") || "", document.baseURI);
      if (url.href.startsWith(root) && /\.html?$/i.test(url.pathname)) {
        e.preventDefault();
        post({ type: "navigate", path: decodeURIComponent(url.href.slice(root.length).replace(/[?#].*$/, "")) });
      } else if (!url.href.startsWith(root) && /^https?:/.test(url.protocol)) {
        a.target = "_blank";
      }
    },
    true
  );
  post({ type: "ready" });
}

/** The script tag to put at the very start of a preview page. */
export function preludeTag(root: string, pageName: string): string {
  const body = `(${prelude.toString()})(${JSON.stringify(root)}, ${JSON.stringify(pageName)}, LINES);`.replace(/<\/script/gi, "<\\/script");
  const lines = (body.match(/\n/g) ?? []).length;
  return `<script>${body.replace("LINES", String(lines))}</script>`;
}
