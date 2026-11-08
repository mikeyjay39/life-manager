---
name: manual-test
description: >-
  Starts the life-manager full stack with the dev profile and verifies new
  functionality on the current git branch against a base branch (default main).
  Use when asked to manual-test a branch, smoke-test the working branch, or
  prove branch changes on a running dev stack. Pass a base branch name as the
  argument when proving a story against a feature branch.
disable-model-invocation: true
argument-hint: '[base-branch]'
---

# Manual test

Prove that the current branch works on a live **dev** stack. Write all prose in ASD-STE100. Do not apply STE to code identifiers or quoted text.

**Base branch:** `$ARGUMENTS` if set, else `MANUAL_TEST_BASE`, else `main`.
Use this name for `git log` / `git diff` discovery (for example `car-manager`
when a deliver-feature story PR targets a feature branch).

## Guardrails

- Use read-only git only. Do not run state-changing git.
- Do not run write SQL or `diesel migration run`.
- Do not use **prod** or Lightsail deploy.
- Do not use **docker-dev** unless the user asks for it.
- Unit or CI tests alone are not proof. Exercise the change on the running stack.
- Do not put secrets from `.dev.env` in the report.
- Leave the stack running after the report.
- For UI checks, use the repo Playwright package in `frontend/` — do not `npm install playwright` under `/tmp`.
- Do not commit screenshot PNGs into the repo.
- Naming local `/tmp` paths on a PR is not proof. Upload PNGs with `gh --attach` when a PR exists.

## Checklist

Copy and track progress:

```text
- [ ] Resolve base branch (argument / MANUAL_TEST_BASE / main)
- [ ] Discover branch vs base (and uncommitted work)
- [ ] Start ./build_and_start_app.sh dev
- [ ] Wait for health and Expo
- [ ] Build verification plan from the diff
- [ ] Exercise new behavior live
- [ ] Show UI screenshots (tmux window + Read PNGs)
- [ ] Post proof on the open PR with uploaded screenshots (`gh --attach`)
- [ ] Report proof
```

## Steps

### 1. Discover scope

From the repo root:

```bash
BASE="${1:-${MANUAL_TEST_BASE:-main}}"   # or $ARGUMENTS from the skill runner
git fetch -q origin "$BASE" 2>/dev/null || true
git branch --show-current
git log --oneline "${BASE}..HEAD"
git diff "${BASE}...HEAD"
git status
git diff
```

Base branch defaults to **`main`**. Override with the skill argument or
`MANUAL_TEST_BASE` (deliver-feature story workers pass the feature branch).
Include uncommitted changes. Summarize user-visible and API behavior that this
branch adds or changes versus that base.

### 2. Start full stack (dev)

```bash
# Allocates or reuses .env.tilt.ports (unique APP_PORT / FRONTEND_PORT per worktree).
./build_and_start_app.sh dev
```

Run it in the background as a **persistent** shell job (so `cargo run` and Expo stay up). Do not pass **prod** unless the user asks.

Several worktrees may run **dev** at once. Each gets its own ports via [scripts/allocate-dev-ports.sh](../../../scripts/allocate-dev-ports.sh). Always read ports from `.env.tilt.ports` after start (see [reference.md](reference.md)).

### 3. Wait until ready

Read ports and the health poll in [reference.md](reference.md).

1. Load `APP_PORT` / `FRONTEND_PORT` from `.env.tilt.ports` (or defaults).
2. Poll `GET /api/health` until the body is `"up"`.
3. Confirm Expo listens on `FRONTEND_PORT`.
4. If health never comes up, stop. Report the failure. Do not claim success.

### 4. Build a verification plan

Map changed paths to live checks:

| Change area | How to prove |
|-------------|--------------|
| Backend API / handlers | `curl` against routes in [docs/agents/api.md](../../../docs/agents/api.md) |
| Frontend UI | Repo Playwright headless smoke (see below); tailor steps to the diff |
| Auth-gated features | Login first (see [reference.md](reference.md)) |

If auth is required and you have no active credentials, ask the user once. Do not activate signup users with write SQL.

Skip docs-only or formatting churn unless it affects runtime.

### 5. Exercise and collect proof

**API-only diffs:** use `curl` (see [reference.md](reference.md)).

**Frontend / UI diffs:**

1. Ensure frontend deps: `cd frontend && npm ci` (or `npm install` if already local).
2. Ensure Chromium: `npm run playwright:install` if launch fails or cache is empty.
3. Load admin creds from `.dev.env` into the environment. Do not print them.
4. Run the smoke helper from `frontend/` (script loads `playwright` from `frontend/node_modules` via `createRequire`):

```bash
cd frontend
set -a && source ../.dev.env && set +a
[[ -f ../.env.tilt.ports ]] && set -a && source ../.env.tilt.ports && set +a
export FRONTEND_URL="http://localhost:${FRONTEND_PORT:-8080}"
# Prefer a per-worktree artifact dir when stacks run in parallel:
export PLAYWRIGHT_ARTIFACTS_DIR="${PLAYWRIGHT_ARTIFACTS_DIR:-/tmp/lm-playwright-artifacts-${FRONTEND_PORT:-8080}}"
node ../.cursor/skills/manual-test/scripts/ui-smoke.mjs
```

5. For flows the smoke script does not cover, write a short one-off under `frontend/` (so bare `import 'playwright'` works), or use `createRequire` on `frontend/package.json` like `ui-smoke.mjs`. Use **`:visible`** locators (Expo web mounts hidden duplicates).

6. **Show UI screenshots** (after smoke success or failure, if PNGs exist):

   - Prefer Ghostty under tmux. From the **repo root**, with the same artifact dir:

```bash
REPO_ROOT="$(pwd)"   # or cd to repo root first
ART="${PLAYWRIGHT_ARTIFACTS_DIR:-/tmp/lm-playwright-artifacts}"
SHOW="$REPO_ROOT/.cursor/skills/manual-test/scripts/show-artifacts.sh"
if [[ -n "${TMUX:-}" ]]; then
  tmux new-window -n manual-test-shots \
    "bash '$SHOW' '$ART'; echo; echo Done. Press Enter.; read"
  tmux select-window -t manual-test-shots
elif [[ "${TERM:-}" == *ghostty* || "${TERM:-}" == *kitty* ]]; then
  bash "$SHOW" "$ART"
fi
```

   - Always **Read** each saved PNG in the chat (`01-home.png` … `06-after-save.png`, plus `error.png` if present) so proof is visible even if the pane is wrong.
   - Host needs `chafa`. Details: [reference.md](reference.md).

Capture commands, status codes, response snippets, screenshots, and UI observations. On failure: stop, leave the stack up, and report what failed.

Optional: run matching automated tests from [docs/agents/testing.md](../../../docs/agents/testing.md) for touched areas. They do not replace live proof.

### 6. Post screenshot proof on the PR

Local `/tmp` paths and filename lists are **not** enough for GitHub review.
When this branch has an open PR (or `MANUAL_TEST_PR` is set), post a proof
comment that **uploads** the PNGs with `gh pr comment --attach`.

1. Resolve the PR:

```bash
PR="${MANUAL_TEST_PR:-}"
if [[ -z "$PR" ]]; then
  PR=$(gh pr view --json number -q .number 2>/dev/null || true)
fi
```

2. If no PR exists, say so in the report and skip this step.
3. Write a markdown body (scenario table + pass/fail). Embed each PNG as
   `![alt](<absolute-or-artifact-path>)` so `gh` can rewrite it. Template:
   [reference.md](reference.md#pr-proof-comment).
4. Post with the helper (preferred) or the same `gh` flags:

```bash
ART="${PLAYWRIGHT_ARTIFACTS_DIR:-/tmp/lm-playwright-artifacts}"
REPO_ROOT="$(pwd)"
bash "$REPO_ROOT/.cursor/skills/manual-test/scripts/post-pr-proof.sh" \
  --pr "$PR" --artifacts "$ART" --body-file /tmp/manual-test-proof.md
```

5. Confirm the comment URL. Open it if useful. The comment must show images on
   github.com (not only local filenames).
6. Do **not** commit PNGs into the git tree.
7. If `--attach` fails, keep the text comment and report that images did not
   upload. Do not claim screenshot proof on the PR.

Needs `gh` 2.99+. deliver-feature story workers must always hit this step for
the story PR. open-pr may also attach images to the PR body; a proof comment
here is still required when a PR exists.

### 7. Report

Tell the user:

- Branch name and a short change summary
- Stack URLs (API and Expo)
- Scenario checklist with pass/fail and evidence
- Artifact dir and whether screenshots were shown in tmux window `manual-test-shots` (or chat-only if no tmux/chafa)
- PR proof comment URL, or that no PR existed / attach failed
- Anything they must do (migrations, activate a user, supply credentials)

## Additional resources

- Ports, health poll, Playwright, login curls: [reference.md](reference.md)
- UI smoke script: [scripts/ui-smoke.mjs](scripts/ui-smoke.mjs)
- Screenshot viewer (Ghostty + tmux): [scripts/show-artifacts.sh](scripts/show-artifacts.sh)
- PR proof with uploads: [scripts/post-pr-proof.sh](scripts/post-pr-proof.sh)
- HTTP routes: [docs/agents/api.md](../../../docs/agents/api.md)
- How to run profiles: [README.md](../../../README.md)
