#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

HEADER=tools/translations/ru_names_header.toml
FRAGMENTS=modular_bandastation/translations/public/ru_names
OUTPUT=modular_bandastation/translations/public/ru_names.toml

fragment_count=$(find "$FRAGMENTS" -type f -name '*.toml' | wc -l)
validated_count=$((fragment_count + 1))

tools/bootstrap/python tools/translations/merge_ru_names.py "$HEADER" "$FRAGMENTS" "$OUTPUT"
tools/bootstrap/python tools/translations/validate_ru_names.py "$OUTPUT"
echo "Validated $validated_count files ($fragment_count fragments + header)"
