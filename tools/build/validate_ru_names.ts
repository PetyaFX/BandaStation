/**
 * Validates TOML files under translation_data/ru_names
 *
 * Rules:
 *   - Valid TOML syntax
 *   - Exactly one root table per file
 *   - All six grammatical case fields present and non-empty
 *   - No unknown fields (catches typos like "nominatve")
 *   - No duplicate keys across files
 *   - Filename matches the TOML key (spaces as underscores)
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { parse } from '@iarna/toml';
import {
  DEFAULT_FRAGMENTS_DIR,
  discoverFragments,
  resolveCliPath,
} from './lib/ru_names';

const REQUIRED_CASE_FIELDS = [
  'nominative',
  'genitive',
  'dative',
  'accusative',
  'instrumental',
  'prepositional',
] as const;

const ALL_KNOWN_FIELDS = new Set<string>([...REQUIRED_CASE_FIELDS, 'gender']);

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
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = parse(readFileSync(fragmentPath, 'utf-8'));
  } catch (exc) {
    errors.push(`TOML parse error: ${exc}`);
    return { relativePath, englishKey: null, errors };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push('expected a TOML table at top level');
    return { relativePath, englishKey: null, errors };
  }

  const doc = parsed as Record<string, unknown>;
  const rootKeys = Object.keys(doc);

  if (rootKeys.length === 0) {
    errors.push('empty document — expected exactly one root table');
    return { relativePath, englishKey: null, errors };
  }

  if (rootKeys.length !== 1) {
    errors.push(
      `expected exactly one root table, found ${rootKeys.length}: ${JSON.stringify(rootKeys.sort())}`,
    );
    return { relativePath, englishKey: null, errors };
  }

  const englishKey = rootKeys[0]!;
  const body = doc[englishKey];

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    errors.push('root table value must be a map of string key/value pairs');
    return { relativePath, englishKey, errors };
  }

  const fields = body as Record<string, unknown>;

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'string') {
      errors.push(`field "${key}" must be a string, got ${typeof value}`);
    }
  }

  for (const key of Object.keys(fields)) {
    if (!ALL_KNOWN_FIELDS.has(key)) {
      errors.push(
        `unknown field "${key}" — allowed fields: ${[...ALL_KNOWN_FIELDS].sort().join(', ')}`,
      );
    }
  }

  for (const caseField of REQUIRED_CASE_FIELDS) {
    const value = fields[caseField];
    if (value === undefined) {
      errors.push(`missing required field "${caseField}"`);
    } else if (typeof value === 'string' && !value.trim()) {
      errors.push(`field "${caseField}" must not be empty`);
    }
  }

  // Filename must match the TOML key
  const stem = basename(fragmentPath, '.toml');
  if (stem !== englishKey && stem.replace(/_/g, ' ') !== englishKey) {
    errors.push(
      `filename "${basename(fragmentPath)}" does not match TOML key "${englishKey}"`,
    );
  }

  return { relativePath, englishKey, errors };
}

function parseArgs(argv: string[]): { fragmentsDir: string } {
  let rawFragmentsDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--fragments-dir' && argv[i + 1]) {
      rawFragmentsDir = argv[++i]!;
    } else {
      console.error(`Unknown argument: ${arg}`);
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
    console.error(`Fragments directory not found: ${fragmentsDir}`);
    return 1;
  }

  const discovered = discoverFragments(fragmentsDir);
  if (discovered.length === 0) {
    console.error(`No *.toml fragments found under ${fragmentsDir}`);
    return 1;
  }

  const results = discovered.map((fragmentPath) =>
    validateFragment(fragmentPath, fragmentsDir),
  );

  // Check for duplicate keys across files in a second pass - each file
  // is parsed once above, so we just iterate the already computed results here
  const seenKeys = new Map<string, string>(); // englishKey -> first relativePath
  for (const result of results) {
    if (result.englishKey === null) continue;
    const firstOccurrence = seenKeys.get(result.englishKey);
    if (firstOccurrence !== undefined) {
      result.errors.push(
        `duplicate english key "${result.englishKey}" — first defined in ${firstOccurrence}`,
      );
    } else {
      seenKeys.set(result.englishKey, result.relativePath);
    }
  }

  const filesWithErrors = results.filter((result) => result.errors.length > 0);

  if (filesWithErrors.length === 0) {
    console.log(`✓  All ${discovered.length} fragments are valid.`);
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
    console.error(`  ${relativePath}:`);
    for (const error of errors) {
      console.error(`    ✗  ${error}`);
    }
  }

  return 1;
}

process.exit(main());
