import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = join(__dirname, '../../..');

export const DEFAULT_FRAGMENTS_DIR = join(
  REPO_ROOT,
  'modular_bandastation/translations/code/translation_data/ru_names',
);

export function discoverFragments(root: string): string[] {
  const paths: string[] = [];

  function walk(dir: string) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.toml')) {
        paths.push(fullPath);
      }
    }
  }

  walk(root);
  return paths.sort();
}

export function resolveCliPath(
  raw: string | undefined,
  fallback: string,
): string {
  if (!raw) return fallback;
  const expanded = raw.replace(/^~(?=$|[/\\])/, homedir());
  if (isAbsolute(expanded)) return resolve(expanded);
  return resolve(REPO_ROOT, expanded);
}
