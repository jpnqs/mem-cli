import fs from "fs";
import path from "path";

/**
 * Load translations from a directory and return a Translator instance.
 * - Reads all *.json files recursively
 * - Deep merges them into one object
 */
export function translate(directory, language = "en") {
  const t = new Translator({ directory, language });

  const languagePath = path.join(directory, language);

  if (!fs.existsSync(languagePath)) {
    throw new Error(`Language folder not found: ${languagePath}`);
  }

  t.translations = t.loadTranslations(languagePath);
  return t;
}

class Translator {
  constructor({ directory, language }) {
    this.translations = {};
    this.language = language || "en";
    this.directory = directory;
  }

  get(key, vars = undefined) {
    try {
      const value = this.walkTree(key, this.translations);

      if (typeof value !== "string") {
        return value ?? key;
      }

      return this.interpolate(value, vars);
    } catch {
      return key;
    }
  }

  interpolate(str, vars = {}) {
    if (!vars) return str;

    return str.replace(/\{\{\s*([a-zA-Z0-9_.$-]+)\s*\}\}/g, (_, key) => {
      const value = this.resolveVariable(key, vars);

      // If variable missing, keep placeholder
      if (value === undefined || value === null) {
        return `{{${key}}}`;
      }

      return String(value);
    });
  }

  resolveVariable(path, vars) {
    const parts = path.split(".");
    let current = vars;

    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }

    return current;
  }

  walkTree(key, obj) {
    const steps = key.split(".");
    let temp = obj;

    for (const step of steps) {
      if (temp == null || typeof temp !== "object") {
        throw new Error("Not found");
      }
      temp = temp[step];
      if (temp === undefined) {
        throw new Error("Not found");
      }
    }

    return temp;
  }

  /**
   * Returns absolute file paths of all translation JSON files under `directory`.
   */
  getTranslationFilesOfDirectory(directory) {
    const files = [];

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(full);
          continue;
        }

        if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
          files.push(full);
        }
      }
    };

    walk(directory);
    return files;
  }

  /**
   * Loads and merges all JSON translation files from a directory.
   */
  loadTranslations(directory) {
    const files = this.getTranslationFilesOfDirectory(directory);

    let merged = {};
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      let json;
      try {
        json = JSON.parse(raw);
      } catch (e) {
        throw new Error(`Invalid JSON in ${file}: ${e.message}`);
      }
      merged = deepMerge(merged, json);
    }

    return merged;
  }
}

/**
 * Deep merge plain objects (later wins).
 */
function deepMerge(target, source) {
  if (!isPlainObject(target)) return structuredCloneIfPossible(source);
  if (!isPlainObject(source)) return structuredCloneIfPossible(source);

  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = structuredCloneIfPossible(v);
    }
  }
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function structuredCloneIfPossible(v) {
  // Node 17+ has structuredClone; otherwise fallback
  if (typeof globalThis.structuredClone === "function")
    return globalThis.structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

export function detectSystemLanguage({ full = false } = {}) {
  const env = process.env;

  // Order of priority
  const locale =
    env.LC_ALL || env.LC_MESSAGES || env.LANG || env.LANGUAGE || "en";

  // Example values:
  // "de_DE.UTF-8"
  // "en_US"
  // "en-US"
  // "de"

  // Remove encoding (".UTF-8")
  const cleaned = locale.split(".")[0];

  // Convert underscore to dash
  const normalized = cleaned.replace("_", "-");

  if (full) {
    return normalized; // e.g. "de-DE"
  }

  // Return only base language
  return normalized.split("-")[0]; // e.g. "de"
}

export { Translator };
