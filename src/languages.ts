import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

export const PLAIN = "Plain text";

export const allLanguages: readonly LanguageDescription[] = [...languages].sort((a, b) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" })
);

/** Shown at the top of the language list. */
export const popularNames = [
  "Python", "JavaScript", "TypeScript", "HTML", "CSS", "JSON", "Java", "C", "C++", "C#",
  "Go", "Rust", "Kotlin", "Swift", "PHP", "Ruby", "Dart", "SQL", "Shell", "Markdown", "YAML", "Lua",
];

export function byName(name: string): LanguageDescription | null {
  return languages.find((l) => l.name === name) ?? null;
}

export function detect(filename: string): LanguageDescription | null {
  const base = filename.split("/").pop() ?? filename;
  const hit = LanguageDescription.matchFilename(languages, base);
  if (hit) return hit;
  // A few common names the data set misses.
  const lower = base.toLowerCase();
  if (lower === "dockerfile" || lower.endsWith(".dockerfile")) return byName("Dockerfile");
  if (lower.endsWith(".env") || lower === ".env") return byName("Properties files");
  return null;
}

/** The language a file uses: the user's choice, or one detected from its name. */
export function languageFor(file: { name: string; lang: string }): LanguageDescription | null {
  if (file.lang === PLAIN) return null;
  if (file.lang) return byName(file.lang) ?? detect(file.name);
  return detect(file.name);
}

const loaded = new Map<string, Promise<LanguageSupport>>();

export function loadLanguage(desc: LanguageDescription): Promise<LanguageSupport> {
  let p = loaded.get(desc.name);
  if (!p) {
    p = desc.support ? Promise.resolve(desc.support) : desc.load();
    p.catch(() => loaded.delete(desc.name));
    loaded.set(desc.name, p);
  }
  return p;
}

/** Short tag shown on file badges, e.g. "py" or "js". */
export function extTag(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  return (ext || "txt").slice(0, 4).toLowerCase();
}

/** The extension people know a language by, e.g. ".py" for Python (not "BUILD"), or undefined. */
export function mainExtension(desc: LanguageDescription): string | undefined {
  const name = desc.name.toLowerCase();
  let best: string | undefined;
  let bestScore = -1;
  for (const ext of desc.extensions) {
    const score = (ext === ext.toLowerCase() ? 2 : 0) + (name.startsWith(ext[0]?.toLowerCase() ?? "") ? 1 : 0);
    if (score > bestScore) {
      best = ext;
      bestScore = score;
    }
  }
  return best ? `.${best}` : undefined;
}
