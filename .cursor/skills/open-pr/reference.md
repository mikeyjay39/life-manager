# open-pr — reference

## Personal summary skill

The review-summary procedure lives in the user’s dotfiles, not in this repo:

`~/.cursor/skills/pr-summary-for-human/SKILL.md`

open-pr uses steps 1–6 of that skill and writes `/tmp/pr-<n>-summary.md`. It does **not** post that markdown as a PR comment. It sets the PR description with `gh pr edit --body-file`.

Needs: `gh`, `pnpm` (for mermaid-cli in that skill), network access to GitHub.

## Manual-test proof section

After a successful manual-test, append this block to a copy of the summary file (`/tmp/pr-<n>-body.md`). Replace `<ART>` with the real artifact directory. Keep only the image lines for files that exist.

```markdown
## Manual test proof

Live **dev** stack check on this branch. Screenshots from Playwright smoke.

| Step | Result |
|------|--------|
| Health / Expo up | pass |
| UI smoke (login → documents → edit → save) | pass |

![01-home](<ART>/01-home.png)
![02-after-login](<ART>/02-after-login.png)
![03-documents](<ART>/03-documents.png)
![04-edit-open](<ART>/04-edit-open.png)
![05-edit-filled](<ART>/05-edit-filled.png)
![06-after-save](<ART>/06-after-save.png)

Artifact dir: `<ART>`
```

Typical smoke names match [manual-test `ui-smoke.mjs`](../manual-test/scripts/ui-smoke.mjs). If a run uses different names, list the PNGs that exist under `<ART>` the same way.

## Attach screenshots to the PR body

`gh` 2.99+ supports `--attach`. Local paths in the body are rewritten to `user-attachments` URLs when the same path is passed to `--attach`.

```bash
n=<PR_NUMBER>
ART="${PLAYWRIGHT_ARTIFACTS_DIR:-/tmp/lm-playwright-artifacts}"
BODY="/tmp/pr-${n}-body.md"

attach_args=()
for f in "$ART"/0{1..6}-*.png; do
  [[ -f "$f" ]] || continue
  base=$(basename "$f")
  name="${base%.png}"
  attach_args+=(--attach "${f}#${name}")
done

gh pr edit "$n" --body-file "$BODY" "${attach_args[@]}"
```

- Do not commit PNGs into the git tree.
- You may attach up to 50 files per command.
- If attach fails, keep the text body from a prior `gh pr edit --body-file` and report the failure.

## Failure comment

When manual-test fails, leave the summary body in place. Post a comment:

```bash
n=<PR_NUMBER>
ART="${PLAYWRIGHT_ARTIFACTS_DIR:-/tmp/lm-playwright-artifacts}"
BRANCH=$(git branch --show-current)
REASON="..."   # one short line; no secrets

body=$(cat <<EOF
## Manual test failed

Branch: \`${BRANCH}\`

The live **dev** manual-test run did not succeed.

**Reason:** ${REASON}

Artifact dir: \`${ART}\`

The PR description still holds the review summary. Fix the failure, then re-run manual-test or open-pr.
EOF
)

if [[ -f "$ART/error.png" ]]; then
  gh pr comment "$n" --body "$body" --attach "$ART/error.png#error"
else
  gh pr comment "$n" --body "$body"
fi
```

## Placeholder PR body

Used only until the summary file is ready:

```text
Placeholder. Summary and manual-test proof follow.
```
