#!/usr/bin/env bash
# Post-build smoke test for @devcomfort/ollama-models
#
# Verifies that the built dist/ artifacts (CJS, ESM, DTS) are loadable
# and that all public exports are intact. Designed to run in CI after
# `pnpm --filter @devcomfort/ollama-models build`.
#
# Exit codes:
#   0 — all checks passed
#   1 — CJS require failed
#   2 — ESM import failed
#   3 — DTS missing or export mismatch

set -euo pipefail

DIST_DIR="packages/ts-client/dist"
EXPECTED="OllamaModelsClient assertCheckResult assertHealthStatus assertModelPage assertModelTags assertSearchResult"

# ─── CJS: verify require() + all exports + instantiation ──────────────────────
echo "=== CJS smoke test ==="
export EXPECTED_EXPORTS="${EXPECTED}"
node -e "
const mod = require('./${DIST_DIR}/index.js');
const exportKeys = Object.keys(mod).sort();
const expected = process.env.EXPECTED_EXPORTS.split(' ').sort();

console.log('CJS exports:', exportKeys.join(', '));

const missing = expected.filter(function(e) { return !exportKeys.includes(e); });
if (missing.length > 0) {
  console.error('ERROR: Missing CJS exports:', missing.join(', '));
  process.exit(1);
}

const unexpected = exportKeys.filter(function(e) { return !expected.includes(e); });
if (unexpected.length > 0) {
  console.error('ERROR: Unexpected CJS exports:', unexpected.join(', '));
  process.exit(1);
}

var client = new mod.OllamaModelsClient();
console.log('CJS: all exports OK, client instantiated OK');
" || { echo "❌ CJS smoke test FAILED"; exit 1; }

# ─── ESM: verify import of all exports + instantiation ────────────────────────
echo "=== ESM smoke test ==="
node --input-type=module -e "
import { ${EXPECTED// /, } } from './${DIST_DIR}/index.mjs';

var names = [${EXPECTED// /, }];
var missing = names.filter(function(n) { return typeof n !== 'function'; });
if (missing.length > 0) {
  console.error('ERROR: ESM exports that are not functions:', missing.length, 'of', names.length);
  process.exit(1);
}
console.log('ESM: all ' + names.length + ' exports present');

var client = new OllamaModelsClient();
console.log('ESM: client instantiated OK');
" || { echo "❌ ESM smoke test FAILED"; exit 2; }

# ─── DTS: verify .d.ts file exists and contains all public exports ────────────
echo "=== DTS check ==="
DTS="${DIST_DIR}/index.d.ts"
[ -s "$DTS" ] || { echo "ERROR: ${DTS} missing or empty"; exit 3; }
for name in ${EXPECTED}; do
  grep -q "export.*${name}" "$DTS" || { echo "ERROR: ${DTS} missing export: ${name}"; exit 3; }
done
echo "DTS: file OK, all exports present"

echo "✅ All post-build smoke tests passed"
