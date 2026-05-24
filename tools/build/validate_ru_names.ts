/**
 * Validates TOML files under translation_data/ru_names
 *
 * Rules:
 *   - Valid TOML syntax
 *   - Exactly one root table per file
 *   - "nominative" field present and non-empty
 *   - Other case fields must not be empty if present
 *   - No unknown fields (catches typos like "nominatve")
 *   - No duplicate keys across files
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import {
  DEFAULT_FRAGMENTS_DIR,
  discoverFragments,
  parseTomlFragment,
  resolveCliPath,
} from './lib/ru_names';

const ALL_CASE_FIELDS = [
  'nominative',
  'genitive',
  'dative',
  'accusative',
  'instrumental',
  'prepositional',
] as const;

const ALL_KNOWN_FIELDS = new Set<string>([...ALL_CASE_FIELDS, 'gender']);

interface FragmentResult {
  relativePath: string;
  englishKey: string | null;
  errors: string[];
}

function validateFragment(
  fragmentPath: string,
  fragmentsRoot: string,
): FragmentResult {
  const relativePath = relative(fragmentsRoot, fragmentPath)
    .split(/[/\\]/)
    .join('/');
  const parsed = parseTomlFragment(readFileSync(fragmentPath, 'utf-8'));

  if (!parsed.ok) {
    return {
      relativePath,
      englishKey: null,
      errors: [`Error: parse error: ${parsed.error}`],
    };
  }

  const { rootKey: englishKey, fields } = parsed.data;
  const errors: string[] = [];

  if (Object.keys(fields).length === 0) {
    errors.push(
      'Error: empty document - expected exactly one root table with fields',
    );
    return { relativePath, englishKey, errors };
  }

  for (const key of Object.keys(fields)) {
    if (!ALL_KNOWN_FIELDS.has(key)) {
      errors.push(
        `Error: unknown field "${key}" - allowed fields: ${[...ALL_KNOWN_FIELDS].sort().join(', ')}`,
      );
    }
  }

  const nominative = fields['nominative'];
  if (nominative === undefined) {
    errors.push('Error: missing required field "nominative"');
  } else if (!nominative.trim()) {
    errors.push('Error: field "nominative" must not be empty');
  }

  for (const caseField of ALL_CASE_FIELDS) {
    if (caseField === 'nominative') continue;
    const value = fields[caseField];
    if (typeof value === 'string' && !value.trim()) {
      errors.push(`Error: field "${caseField}" must not be empty`);
    }
  }

  return { relativePath, englishKey, errors };
}

function parseArgs(argv: string[]): { fragmentsDir: string } {
  let rawFragmentsDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--fragments-dir' && argv[i + 1]) {
      rawFragmentsDir = argv[++i];
    } else {
      console.error(`Error: Unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  return {
    fragmentsDir: resolveCliPath(rawFragmentsDir, DEFAULT_FRAGMENTS_DIR),
  };
}

function main(): number {
  const { fragmentsDir } = parseArgs(process.argv.slice(2));

  if (!existsSync(fragmentsDir) || !statSync(fragmentsDir).isDirectory()) {
    console.error(`Error: Fragments directory not found: ${fragmentsDir}`);
    return 1;
  }

  const discovered = discoverFragments(fragmentsDir);
  if (discovered.length === 0) {
    console.error(`Error: No *.toml fragments found under ${fragmentsDir}`);
    return 1;
  }

  const results = discovered.map((fragmentPath) =>
    validateFragment(fragmentPath, fragmentsDir),
  );

  const seenKeys = new Map<string, string>();
  for (const result of results) {
    if (result.englishKey === null) continue;
    const firstPath = seenKeys.get(result.englishKey);
    if (firstPath !== undefined) {
      result.errors.push(
        `Error: duplicate key "${result.englishKey}" - first defined in ${firstPath}`,
      );
      continue;
    }
    seenKeys.set(result.englishKey, result.relativePath);
  }

  const filesWithErrors = results.filter((result) => result.errors.length > 0);
  if (filesWithErrors.length === 0) {
    console.log(`Success: All ${discovered.length} fragments are valid.`);
    return 0;
  }

  const totalErrors = filesWithErrors.reduce(
    (sum, result) => sum + result.errors.length,
    0,
  );
  console.error(
    `Validation failed: ${totalErrors} error(s) in ${filesWithErrors.length} of ${discovered.length} file(s)\n`,
  );
  for (const { relativePath, errors } of filesWithErrors) {
    console.error(`${relativePath}:`);
    for (const error of errors) {
      console.error(`  ${error}`);
    }
  }

  return 1;
}

process.exit(main());
