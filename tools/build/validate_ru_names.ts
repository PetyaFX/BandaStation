/**
 * Validates TOML files under translation_data/ru_names
 *
 * Rules:
 *   - Valid TOML syntax
 *   - Exactly one root table per file
 *   - All six grammatical case fields present and non-empty
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

  const result = parseTomlFragment(readFileSync(fragmentPath, 'utf-8'));

  if (!result.ok) {
    errors.push(`parse error: ${result.error}`);
    return { relativePath, englishKey: null, errors };
  }

  const { rootKey: englishKey, fields } = result.data;

  if (Object.keys(fields).length === 0) {
    errors.push('empty document — expected exactly one root table with fields');
    return { relativePath, englishKey, errors };
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
    } else if (!value.trim()) {
      errors.push(`field "${caseField}" must not be empty`);
    }
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
