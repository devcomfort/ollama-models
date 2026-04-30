#!/usr/bin/env bash
# E2E test suite against the deployed ollama-models API.
#
# usage: ./scripts/e2e.sh [BASE_URL]
#   BASE_URL defaults to https://ollama-models-api.devcomfort.workers.dev

set -euo pipefail

BASE_URL="${1:-https://ollama-models-api.devcomfort.workers.dev}"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

http() {
  local method="$1"
  local path="$2"
  local out="$TMPDIR/resp.json"
  local code
  code=$(curl -s -o "$out" -w "%{http_code}" "$BASE_URL$path")
  echo "$code"
}

json() {
  cat "$TMPDIR/resp.json"
}

assert_eq() {
  local got="$1"
  local want="$2"
  local msg="$3"
  if [ "$got" = "$want" ]; then
    echo "  ✅ $msg"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $msg — expected '$want', got '$got'"
    FAIL=$((FAIL + 1))
  fi
}

assert_has_key() {
  local key="$1"
  local msg="$2"
  if json | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if '$key' in d else 1)"; then
    echo "  ✅ $msg"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $msg — key '$key' missing"
    FAIL=$((FAIL + 1))
  fi
}

# ---------------------------------------------------------------------------
# tests
# ---------------------------------------------------------------------------

echo "=== GET /health ==="
CODE=$(http GET /health)
assert_eq "$CODE" "200" "returns HTTP 200"
assert_has_key "ok" "has 'ok' field"
assert_has_key "timestamp" "has 'timestamp' field"
assert_has_key "checks" "has 'checks' field"
OK=$(json | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])")
assert_eq "$OK" "True" "ok is true"

echo "=== GET /search ==="
CODE=$(http GET /search?q=qwen3\&page=1)
assert_eq "$CODE" "200" "returns HTTP 200"
assert_has_key "pages" "has 'pages' field"
assert_has_key "page_range" "has 'page_range' field"
assert_has_key "keyword" "has 'keyword' field"
KEYWORD=$(json | python3 -c "import sys,json; print(json.load(sys.stdin)['keyword'])")
assert_eq "$KEYWORD" "qwen3" "keyword matches query"
HAS_MODEL_ID=$(json | python3 -c "import sys,json; pages=json.load(sys.stdin).get('pages',[]); print('true' if pages and 'model_id' in pages[0] else 'false')")
assert_eq "$HAS_MODEL_ID" "true" "first page has 'model_id'"

echo "=== GET /model ==="
CODE=$(http GET /model?name=library/qwen3)
assert_eq "$CODE" "200" "returns HTTP 200"
assert_has_key "page_url" "has 'page_url' field"
assert_has_key "id" "has 'id' field"
assert_has_key "tags" "has 'tags' field"
assert_has_key "default_tag" "has 'default_tag' field"
ID=$(json | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
assert_eq "$ID" "library/qwen3" "id matches request"

echo "=== GET /search — 400 validation (q too long) ==="
LONG_Q=$(python3 -c 'print("x"*250)')
CODE=$(http GET "/search?q=$LONG_Q")
assert_eq "$CODE" "400" "returns HTTP 400 for oversized q"
assert_has_key "error" "has 'error' field"
ERR_CODE=$(json | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])")
assert_eq "$ERR_CODE" "INVALID_PARAMETER" "error code is INVALID_PARAMETER"

echo "=== GET /model — 400 validation (missing name) ==="
CODE=$(http GET /model)
assert_eq "$CODE" "400" "returns HTTP 400 for missing name"

echo "=== GET /model — 400 validation (bare name) ==="
CODE=$(http GET /model?name=qwen3)
assert_eq "$CODE" "400" "returns HTTP 400 for bare name without profile"

echo "=== GET /search — 502 scraper error (invalid page) ==="
# empty keyword with very high page may yield no results → 502 SCRAPE_NO_RESULTS
CODE=$(http GET /search?q=nonexistentmodelxyz123\&page=999)
# 502 is acceptable for upstream failures; we just verify it's not 500
if [ "$CODE" = "502" ] || [ "$CODE" = "200" ]; then
  echo "  ✅ returns HTTP $CODE (acceptable for upstream/no-results)"
  PASS=$((PASS + 1))
else
  echo "  ❌ unexpected HTTP $CODE"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# summary
# ---------------------------------------------------------------------------

echo ""
echo "─────────────────────────────"
echo "E2E Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
