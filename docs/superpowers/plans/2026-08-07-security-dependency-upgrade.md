# Security Dependency Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every npm security advisory reported by `pnpm audit` while preserving the public API, both clients, documentation routes, and all non-security-related dependency majors.

**Architecture:** Upgrade the closest direct dependency inside its current major first, regenerate one workspace lockfile, and audit the resulting tree before allowing any exception. Isolate the two security-required major changes—Astro 7 with its compatible Starlight release, and `@hono/node-server` 2—behind their own build and integration gates. Add a root `pnpm.overrides` entry only when the updated direct parent still resolves a vulnerable transitive package and the override removes a confirmed advisory.

**Tech Stack:** pnpm 10 workspace, Nx 23, TypeScript 5, Hono 4, Cloudflare Wrangler 4, Astro/Starlight, Vitest 4, Playwright, Python 3.8+ with uv/pytest.

## Global Constraints

- The source of truth is `docs/superpowers/specs/2026-08-07-security-dependency-upgrade-design.md`.
- Finish with `pnpm audit` reporting High 0, Moderate 0, Low 0, and total 0.
- Apply the latest observed safe release inside the current major before considering a major update or override.
- Permit Astro 7 and `@hono/node-server` 2 only because no patched release exists in their current majors.
- Do not move TypeScript to 7, `@cloudflare/workers-types` to 5, `node-html-parser` to 9, `@types/node` to 26, or any other non-security-related direct dependency to a new major.
- Do not change Python dependency constraints; run the complete Python test suite because it exercises the production Hono app through `api/scripts/ci-server.ts`.
- Preserve the API endpoints, response schemas, TypeScript/Python client contracts, OpenAPI output, locale routes, and Starlight navigation.
- Do not reimplement production routes, validation, cache middleware, or scrapers in a test server.
- Do not add an override unless `pnpm why -r <package>` proves the vulnerable path remains after parent updates and a subsequent audit proves the override removes at least one advisory.
- Do not commit or push until the user explicitly says `커밋`, `commit`, or `push`. Every commit step below is authorization-gated.

---

## File Map

- Modify `package.json`: update vulnerable workspace tooling inside the current major; hold only proven residual transitive overrides.
- Modify `api/package.json`: update Hono, Vitest, Wrangler, and the security-required `@hono/node-server` major.
- Modify `docs/package.json`: update Wrangler, then isolate the Astro 7 and compatible Starlight upgrade.
- Modify `pnpm-lock.yaml`: regenerate solely through pnpm after every accepted manifest change.
- Inspect, but do not modify by default, `api/scripts/ci-server.ts`: its `serve({ fetch, port }, callback)` contract must continue to work with `@hono/node-server` 2.
- Inspect, but do not modify by default, `docs/astro.config.mjs`: its Starlight locale and sidebar contract must continue to build on Astro 7.
- Inspect, but do not modify by default, `api/vitest.config.ts`, `packages/ts-client/vitest.config.ts`, and `playwright.config.ts`: configuration changes are allowed only in response to a reproduced compatibility failure.
- Do not create new production source or test files. Existing unit, integration, E2E, build, and browser checks already exercise the observable contracts affected by these dependency changes.

---

### Task 1: Upgrade Vulnerable Parents Within Current Majors

**Files:**
- Modify: `package.json:41-45`
- Modify: `api/package.json:16-30`
- Modify: `docs/package.json:10-15`
- Modify: `pnpm-lock.yaml`
- Test: existing workspace audit, type-check, and unit-test targets

**Interfaces:**
- Consumes: the current pnpm workspace and the advisory baseline of High 12, Moderate 20, Low 2, total 34.
- Produces: a lockfile using Nx 23.1.1, Hono 4.13.1, Wrangler 4.120.0, and Vitest 4.1.10 without changing any unrelated major.

- [ ] **Step 1: Reproduce the security baseline**

Run:

```bash
pnpm audit --json | jq '.metadata.vulnerabilities'
```

Expected before edits:

```json
{
  "info": 0,
  "low": 2,
  "moderate": 20,
  "high": 12,
  "critical": 0,
  "total": 34
}
```

If the registry reports a newer advisory, record the new package, vulnerable path, severity, and patched floor before editing; the completion gate remains total 0.

- [ ] **Step 2: Pin the approved current-major parent releases**

Apply these exact manifest changes and leave every unlisted dependency unchanged:

```json
// package.json
"devDependencies": {
  "@playwright/test": "^1.61.1",
  "@vitest/coverage-v8": "^4.1.10",
  "nx": "^23.1.1",
  "tsx": "^4.21.0"
}
```

```json
// api/package.json
"dependencies": {
  "@hono/zod-openapi": "^1.2.4",
  "hono": "^4.13.1",
  "node-html-parser": "^7.1.0",
  "zod": "^4.3.6"
},
"devDependencies": {
  "@cloudflare/workers-types": "^4.0.0",
  "@hono/node-server": "^1.19.13",
  "@types/node": "^25.5.2",
  "pathe": "^2.0.3",
  "tsx": "^4.21.0",
  "typescript": "^5.0.0",
  "vitest": "^4.1.10",
  "wrangler": "^4.120.0"
}
```

```json
// docs/package.json
"dependencies": {
  "@astrojs/starlight": "^0.38.5",
  "astro": "^6.4.8"
},
"devDependencies": {
  "wrangler": "^4.120.0"
}
```

- [ ] **Step 3: Regenerate the lockfile**

Run:

```bash
pnpm install
```

Expected: exit 0; `pnpm-lock.yaml` records the manifest specifiers above; no Python file changes.

- [ ] **Step 4: Verify the selected direct versions**

Run:

```bash
pnpm list -r --depth 0 nx hono wrangler vitest @vitest/coverage-v8
```

Expected: Nx 23.1.1, Hono 4.13.1, Wrangler 4.120.0, Vitest 4.1.10, and `@vitest/coverage-v8` 4.1.10 appear in their owning projects; no listed package crosses another major.

- [ ] **Step 5: Prove the current-major batch works**

Run:

```bash
pnpm type-check
pnpm test:api
pnpm test:ts
```

Expected: all commands exit 0; API and TypeScript client test counts do not decrease from 64 and 28 respectively.

- [ ] **Step 6: Confirm the direct Hono and Nx advisories are gone**

Run:

```bash
pnpm audit --json | jq -e '([.advisories[].module_name] | index("hono")) == null and ([.advisories[].module_name] | index("nx")) == null'
```

Expected: `true` and exit 0. Remaining advisories, if any, must belong to the isolated major or residual-transitive tasks below.

- [ ] **Step 7: Authorization-gated commit**

Do not run without explicit user authorization. After authorization:

```bash
git add package.json api/package.json docs/package.json pnpm-lock.yaml
git commit -m "chore(deps): update vulnerable packages within current majors"
```

Expected: one commit containing only the three manifests and lockfile.

---

### Task 2: Isolate the Required Node Server Major Upgrade

**Files:**
- Modify: `api/package.json:22-30`
- Modify: `pnpm-lock.yaml`
- Verify unchanged unless a reproduced API incompatibility requires revision: `api/scripts/ci-server.ts:27-59`
- Test: `packages/py-client/tests/integration/test_integration.py`

**Interfaces:**
- Consumes: the production `app.fetch(request, env)` adapter and `serve({ fetch, port }, callback)` startup contract in `api/scripts/ci-server.ts`.
- Produces: the same `READY\n` process protocol on port 8788 under `@hono/node-server` 2.1.0.

- [ ] **Step 1: Upgrade only `@hono/node-server`**

Apply:

```json
// api/package.json
"@hono/node-server": "^2.1.0"
```

Leave the surrounding development dependencies exactly as established in Task 1.

- [ ] **Step 2: Regenerate the lockfile**

Run:

```bash
pnpm install
```

Expected: exit 0; the API importer resolves `@hono/node-server` 2.1.0 or a compatible 2.1.x patch.

- [ ] **Step 3: Verify the existing bootstrap contract compiles**

Run:

```bash
pnpm exec nx type-check api
```

Expected: exit 0 with no error at `api/scripts/ci-server.ts:50-59`. Do not edit the bootstrap when the existing API remains compatible.

- [ ] **Step 4: Exercise the real Node integration path**

Run:

```bash
cd packages/py-client && uv run pytest tests/integration/test_integration.py -v
```

Expected: all integration tests pass; the fixture observes `READY`, sends requests through the production Hono app, and terminates the subprocess cleanly.

- [ ] **Step 5: Prove the node-server advisory is gone**

Run from the repository root:

```bash
pnpm audit --json | jq -e '([.advisories[].module_name] | index("@hono/node-server")) == null'
```

Expected: `true` and exit 0.

- [ ] **Step 6: Authorization-gated commit**

Do not run without explicit user authorization. After authorization:

```bash
git add api/package.json pnpm-lock.yaml api/scripts/ci-server.ts
git commit -m "chore(deps): upgrade Hono Node server"
```

Expected: the compatibility file is included only if a reproduced compile or integration failure required a concrete fix.

---

### Task 3: Isolate the Required Astro and Starlight Upgrade

**Files:**
- Modify: `docs/package.json:10-15`
- Modify: `pnpm-lock.yaml`
- Verify unchanged unless a reproduced Astro 7 error requires revision: `docs/astro.config.mjs:1-52`
- Test: all Starlight source pages through `pnpm build:docs` and browser smoke checks

**Interfaces:**
- Consumes: Starlight locale configuration with `en` and `ko`, default locale `en`, and the existing sidebar links.
- Produces: the same `/en/`, `/ko/`, `/en/api-reference/`, and `/ko/architecture/` routes on Astro 7.2.0 with Starlight 0.41.7.

- [ ] **Step 1: Upgrade the security-required docs pair together**

Apply:

```json
// docs/package.json
"dependencies": {
  "@astrojs/starlight": "^0.41.7",
  "astro": "^7.2.0"
},
"devDependencies": {
  "wrangler": "^4.120.0"
}
```

Do not change content, locale labels, sidebar order, or route links.

- [ ] **Step 2: Regenerate the lockfile**

Run:

```bash
pnpm install
```

Expected: exit 0; Astro resolves to 7.2.0 or a compatible 7.2.x patch and Starlight resolves to 0.41.7 or a compatible 0.41.x patch.

- [ ] **Step 3: Build the documentation**

Run:

```bash
pnpm build:docs
```

Expected: exit 0; Astro reports a completed static build with no invalid-HTML, reserved `src/fetch.ts`, removed experimental-option, or integration compatibility error. Do not edit `docs/astro.config.mjs` when this gate passes.

- [ ] **Step 4: Prove the Astro-family advisories are gone**

Run:

```bash
pnpm audit --json | jq -e '([.advisories[].module_name] | map(select(. == "astro" or . == "js-yaml" or . == "svgo")) | length) == 0'
```

Expected: `true` and exit 0.

- [ ] **Step 5: Smoke-test the localized docs in a real browser**

Load the `agent-browser` skill. Start the docs server as a managed process, not a foreground shell watcher:

```bash
pnpm --dir docs dev --host 127.0.0.1 --port 4321
```

Navigate to each exact URL:

```text
http://127.0.0.1:4321/en/
http://127.0.0.1:4321/ko/
http://127.0.0.1:4321/en/api-reference/
http://127.0.0.1:4321/ko/architecture/
```

Expected on every page: HTTP 200; main heading and navigation visible; correct locale retained; no blank content, broken sidebar, or browser console error. Stop the managed docs process after the checks.

- [ ] **Step 6: Authorization-gated commit**

Do not run without explicit user authorization. After authorization:

```bash
git add docs/package.json pnpm-lock.yaml docs/astro.config.mjs
git commit -m "chore(deps): upgrade Astro security baseline"
```

Expected: `docs/astro.config.mjs` is included only if the Astro 7 build or browser reproduction required a concrete compatibility fix.

---

### Task 4: Remove Only Proven Residual Transitive Advisories

**Files:**
- Modify conditionally: `package.json:29-38`
- Modify: `pnpm-lock.yaml`
- Test: workspace audit plus the owning parent package's existing tests

**Interfaces:**
- Consumes: the post-Task-3 `pnpm audit --json` module names and `pnpm why -r` paths.
- Produces: either no new override or the smallest advisory-floor overrides needed for total 0.

Use this fixed advisory-floor table; do not invent a different floor or use `latest`:

| Residual module | Minimum patched override |
|---|---:|
| `axios` | `>=1.18.0` |
| `brace-expansion` | `>=5.0.9` |
| `js-yaml` | `>=4.3.1` |
| `nanoid` | `>=3.3.17` |
| `postcss` | `>=8.5.23` |
| `sharp` | `>=0.35.0` |
| `svgo` | `>=4.0.2` |
| `undici` | `>=7.29.0` |

- [ ] **Step 1: Enumerate only the advisories still present**

Run:

```bash
pnpm audit --json | jq -r '.advisories | to_entries[] | [.value.module_name, .value.severity, .value.patched_versions, .value.findings[0].paths[0]] | @tsv' | sort -u
```

Expected: no output when Tasks 1–3 resolved the full tree. If output remains, every module must be present in the table above; a new module requires returning to the direct-parent/current-major decision rule before adding any override.

- [ ] **Step 2: Prove each remaining dependency path**

For each module printed in Step 1, run the corresponding command from this exact list:

```bash
pnpm why -r axios
pnpm why -r brace-expansion
pnpm why -r js-yaml
pnpm why -r nanoid
pnpm why -r postcss
pnpm why -r sharp
pnpm why -r svgo
pnpm why -r undici
```

Run only commands for modules that remain. Expected: each output identifies Nx, Starlight/Astro, Vitest/Vite, or Wrangler/Miniflare as the direct-parent path already updated in Tasks 1–3.

- [ ] **Step 3: Add the minimum proven overrides**

Keep the existing Vite and esbuild overrides. Add only keys whose module was printed in Step 1 and proven in Step 2:

```json
"pnpm": {
  "onlyBuiltDependencies": [
    "esbuild",
    "sharp",
    "workerd"
  ],
  "overrides": {
    "vite": ">=7.3.5",
    "esbuild": ">=0.28.1",
    "axios": ">=1.18.0",
    "brace-expansion": ">=5.0.9",
    "js-yaml": ">=4.3.1",
    "nanoid": ">=3.3.17",
    "postcss": ">=8.5.23",
    "sharp": ">=0.35.0",
    "svgo": ">=4.0.2",
    "undici": ">=7.29.0"
  }
}
```

The block above is the complete allowed superset, not a request to add all eight entries. Omit every unproven key.

- [ ] **Step 4: Regenerate and audit the resolved tree**

Run:

```bash
pnpm install
pnpm audit --json | jq -e '.metadata.vulnerabilities.total == 0 and .metadata.vulnerabilities.high == 0 and .metadata.vulnerabilities.moderate == 0 and .metadata.vulnerabilities.low == 0'
```

Expected: `true` and exit 0.

- [ ] **Step 5: Remove ineffective overrides**

For each new override, remove that one key, run `pnpm install`, and rerun the Step 4 audit expression. Keep the key only if its removal makes total vulnerabilities greater than 0; restore it and reinstall before checking the next key.

Expected: every retained override has one observable audit justification; no redundant override remains.

- [ ] **Step 6: Re-run the owning package gates**

Run:

```bash
pnpm type-check
pnpm test:api
pnpm test:ts
pnpm build:docs
```

Expected: all commands exit 0 after the final override set is installed.

- [ ] **Step 7: Authorization-gated commit**

Do not run without explicit user authorization. After authorization and only when Task 4 changed files:

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): constrain patched transitive packages"
```

Expected: no commit is created when no residual override was necessary.

---

### Task 5: Run the Complete Contract and Reproducibility Gates

**Files:**
- Verify: `pnpm-lock.yaml`
- Verify generated contract: `api/openapi.json`
- Test: all existing API, TypeScript, Python, docs, and E2E suites

**Interfaces:**
- Consumes: the final manifests and lockfile from Tasks 1–4.
- Produces: reproducible-install, zero-advisory, contract, build, integration, and E2E evidence.

- [ ] **Step 1: Prove the lockfile supports a clean frozen install**

Run:

```bash
pnpm install --frozen-lockfile
```

Expected: exit 0 with no lockfile update request.

- [ ] **Step 2: Prove the final security count is zero**

Run:

```bash
pnpm audit --json | jq '.metadata.vulnerabilities'
```

Expected:

```json
{
  "info": 0,
  "low": 0,
  "moderate": 0,
  "high": 0,
  "critical": 0,
  "total": 0
}
```

- [ ] **Step 3: Run all static checks and package builds**

Run:

```bash
pnpm type-check
pnpm build
pnpm build:docs
```

Expected: all commands exit 0; API, TypeScript client, Python client, and docs build targets complete.

- [ ] **Step 4: Run all unit and integration suites**

Run:

```bash
pnpm test:api
pnpm test:ts
pnpm test:py
```

Expected: all commands exit 0; API tests are not fewer than 64, TypeScript client tests are not fewer than 28, and Python tests are not fewer than 39. Any count increase must correspond to an added observable-contract test; a decrease is a failure.

- [ ] **Step 5: Prove OpenAPI generation is stable**

Run:

```bash
before=$(sha256sum api/openapi.json)
pnpm gen-openapi
after=$(sha256sum api/openapi.json)
test "$before" = "$after"
```

Expected: exit 0; dependency changes do not alter `api/openapi.json`.

- [ ] **Step 6: Run browser E2E and README schema lint**

Run:

```bash
pnpm test:e2e
pnpm test:lint-readme
```

Expected: both commands exit 0; all configured Playwright scenarios pass and README schema names remain current.

- [ ] **Step 7: Repeat the real docs browser smoke test**

Repeat Task 3 Step 5 against the final lockfile and override set.

Expected: the four locale/reference/architecture URLs still return visible, navigable pages with no browser console error.

---

### Task 6: Review Scope, Security, and Remote Handoff

**Files:**
- Review: `package.json`
- Review: `api/package.json`
- Review: `docs/package.json`
- Review: `pnpm-lock.yaml`
- Review only if changed: `api/scripts/ci-server.ts`, `docs/astro.config.mjs`, Vitest/Playwright configuration

**Interfaces:**
- Consumes: all local changes and verification evidence.
- Produces: a local completion report and, only after explicit authorization, commits/push plus GitHub alert confirmation.

- [ ] **Step 1: Run graph-grounded review**

Run:

```bash
gortex review --scope all --audience agent
```

Expected: no blocking finding. Fix every critical/error finding, then rerun the exact review command until it clears.

- [ ] **Step 2: Verify the intended dependency boundaries**

Read the three manifests and confirm these invariants exactly:

```text
TypeScript remains major 5.
@cloudflare/workers-types remains major 4.
node-html-parser remains major 7.
@types/node remains major 25.
Hono remains major 4.
Wrangler remains major 4.
Vitest remains major 4.
Nx remains major 23.
Only Astro changes 6 -> 7.
Only @hono/node-server changes 1 -> 2.
Python dependency constraints are unchanged.
```

Expected: every line is true.

- [ ] **Step 3: Review retained overrides and generated files**

For each root override, attach one reason to the final report:

```text
vite >=7.3.5: pre-existing Vite advisory floor.
esbuild >=0.28.1: pre-existing esbuild advisory floor.
Each new key: residual module path from pnpm why plus the advisory count it removes.
```

Expected: no unexplained override, temporary file, secret, generated-cache directory, or OpenAPI change remains.

- [ ] **Step 4: Report local completion without committing or pushing**

Report the exact final package versions, retained overrides, `pnpm audit` counts, test/build commands, observed test counts, browser URLs, and any compatibility source changes. State explicitly that changes remain local because commit/push authorization has not been given.

Expected: the report distinguishes directly observed results from any inference and contains no claim about GitHub alert closure before a push.

- [ ] **Step 5: Authorization-gated final commit and push**

Run only after the user explicitly authorizes commit/push. If earlier task commits were intentionally deferred, create logically separated commits using the task-specific commands above; then push the current branch.

Expected: the remote branch contains exactly the reviewed local dependency work and no unrelated file.

- [ ] **Step 6: Confirm GitHub security state after authorized push**

After the pushed lockfile is indexed, query open Dependabot alerts for the repository and rerun the relevant GitHub Actions workflows.

Expected: zero open alerts for the 26 original dependency paths; CI and deployment verification jobs complete successfully. If GitHub has not indexed the new lockfile yet, report the alert state as pending rather than claiming closure.
