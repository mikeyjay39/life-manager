---
name: open-pr
description: >-
  Opens a pull request for the current branch against main, fills the PR body
  from the personal pr-summary-for-human skill, runs the manual-test skill, and
  either attaches screenshots to the PR body or comments on failure. Use when
  asked to open-pr, open a PR with summary and manual-test proof, or ship the
  current branch as a pull request.
disable-model-invocation: true
---

# Open PR

Open a pull request for the current branch against **main**. Fill the body from
the personal review-summary skill. Then prove the branch with **manual-test**.
Write all prose in ASD-STE100. Do not apply STE to code identifiers or quoted text.

```text
Agent
  |-- check branch clean vs main
  |-- git push -u origin HEAD (this skill only)
  |-- gh pr create (or reuse open PR)
  |-- pr-summary-for-human steps 1-6 -> gh pr edit --body-file
  |-- manual-test skill (full)
  |-- OK:  append proof + gh pr edit --attach PNGs
  |-- FAIL: gh pr comment (manual test failed)
```

## Guardrails

- Base branch is always **`main`**.
- Do not use **prod** or Lightsail.
- Do not approve or request changes on the PR.
- Do not put secrets from `.dev.env` in the PR body or comments.
- Do not commit screenshot PNGs into the repo.
- Do not copy the long procedures from other skills into this file. **Read** them and follow them in place.
- Leave the manual-test stack running after the run.
- If `gh` attach fails, keep the text body and tell the user that images did not upload.
- **Git:** commit first if the tree is dirty (user asks to open-pr with uncommitted work). This skill may run `git push -u origin HEAD`. Do not force-push, reset hard, or merge to `main`. See [AGENTS.md](../../../AGENTS.md).

## Checklist

Copy and track progress:

```text
- [ ] Discover branch; clean tree; commits vs main
- [ ] Push branch (open-pr exception)
- [ ] Create or reuse PR against main
- [ ] Write summary (pr-summary-for-human steps 1–6) into PR body
- [ ] Run manual-test
- [ ] Success: attach screenshots to PR body / Failure: comment
- [ ] Report PR URL and result
```

## Steps

### 1. Discover scope

From the repo root:

```bash
git branch --show-current
git status
git log --oneline main..HEAD
git diff main...HEAD --stat
```

- If the working tree is dirty (uncommitted changes), **stop**. Tell the user to commit first.
- If `main..HEAD` has no commits, **stop**. Tell the user there is nothing to open.
- Summarize the change in one short list for the PR title later.

### 2. Push the branch

This step is allowed only because the user invoked **open-pr**:

```bash
git push -u origin HEAD
```

If push fails, stop and report the error.

### 3. Create or reuse the PR

```bash
gh pr view --json number,url,title,state,baseRefName,headRefName
```

- If an open PR exists for this head branch: reuse its number and URL. Confirm `baseRefName` is `main` (or note if it is not).
- If none exists, create one. Build a short title from the commits (first subject line, or a clear summary). Use a placeholder body:

```bash
TITLE="..."   # from git log main..HEAD
gh pr create --base main --title "$TITLE" --body "Placeholder. Summary and manual-test proof follow."
```

Record `PR_NUMBER` and `PR_URL`.

### 4. Fill the PR body from pr-summary-for-human

1. **Read** `~/.cursor/skills/pr-summary-for-human/SKILL.md`.
2. Follow **steps 1 through 6** only (find change, read code, decide content, build links, write markdown, check Mermaid).
3. Target this PR number. Write the file to `/tmp/pr-<n>-summary.md` (or the scratchpad path that skill names).
4. Do **not** run that skill’s step 7 (`gh pr comment` / open the comment URL).
5. Apply the summary as the PR body:

```bash
gh pr edit <n> --body-file /tmp/pr-<n>-summary.md
```

Keep `/tmp/pr-<n>-summary.md` for step 6. Details: [reference.md](reference.md).

### 5. Run manual-test

1. **Read** [`.cursor/skills/manual-test/SKILL.md`](../manual-test/SKILL.md).
2. Follow that skill fully (dev stack, health, verification plan, live proof, screenshots).
3. Note pass or fail, the artifact dir (`PLAYWRIGHT_ARTIFACTS_DIR`, default `/tmp/lm-playwright-artifacts`), and any short failure reason.

### 6. Update the PR with proof or failure

**On success**

1. Copy the summary file to `/tmp/pr-<n>-body.md`.
2. Append the manual-test proof section (template in [reference.md](reference.md)). Reference local PNG paths so `gh --attach` can rewrite them.
3. Edit the PR and attach each existing `01`–`06` screenshot:

```bash
ART="${PLAYWRIGHT_ARTIFACTS_DIR:-/tmp/lm-playwright-artifacts}"
# build --attach flags only for files that exist; see reference.md
gh pr edit <n> --body-file /tmp/pr-<n>-body.md --attach ...
```

**On failure**

Post a PR comment (do not replace the summary body). Attach `error.png` when it exists. Template: [reference.md](reference.md).

```bash
gh pr comment <n> --body "..." [--attach "$ART/error.png#error"]
```

### 7. Report

Tell the user:

- PR URL and number
- Whether the summary body was applied
- Manual-test pass or fail
- Whether screenshots were attached (or that attach failed)
- Stack URLs if the stack is still up
- Anything they must do next

## Additional resources

- Proof section, attach flags, failure comment: [reference.md](reference.md)
- Manual test: [../manual-test/SKILL.md](../manual-test/SKILL.md)
- Personal summary skill: `~/.cursor/skills/pr-summary-for-human/SKILL.md`
