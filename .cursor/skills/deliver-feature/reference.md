# Deliver feature — reference

## Sub-issues

```bash
OWNER=… REPO=… N=…
gh api graphql -f query="
query {
  repository(owner:\"$OWNER\", name:\"$REPO\") {
    issue(number: $N) {
      number title
      subIssues(first: 50) {
        nodes { number title state url }
      }
    }
  }
}"
```

If `nodes` is empty, the feature issue is the single story.

## Feature branch slug

1. Lowercase the title.
2. Replace non-alphanumeric runs with `-`.
3. Trim leading/trailing `-`. Keep it short (about 40 chars).

## Worktree setup

Main checkout must have unlocked git-crypt keys and readable `.dev.env` /
`.prod.env`.

```bash
MAIN=/path/to/life-manager
FEATURE=car-manager   # example
BRANCH=mikeyjay39/gh-122-car-domain
WT="${MAIN}.mikeyjay39-gh-122-car-domain"

git fetch origin "$FEATURE"
git -C "$MAIN" -c filter.git-crypt.smudge=cat \
  -c filter.git-crypt.clean=cat \
  -c filter.git-crypt.required=false \
  worktree add -b "$BRANCH" "$WT" "origin/$FEATURE"

cp -a "$MAIN/.dev.env" "$WT/.dev.env"
cp -a "$MAIN/.prod.env" "$WT/.prod.env"
gd=$(git -C "$WT" rev-parse --git-dir)
mkdir -p "$gd/git-crypt/keys"
cp -a "$MAIN/.git/git-crypt/keys/." "$gd/git-crypt/keys/"
```

Optional: `wt switch --create "$BRANCH" --base "origin/$FEATURE" --no-cd -y`
then still copy env files and git-crypt keys the same way.

Do **not** commit `.dev.env`, `.prod.env`, certs, or `.env.tilt.ports`.

## Concurrency

| Cap | What counts |
|-----|-------------|
| 3 workers | `cursor-agent` implementing, in pr-review-loop, or writing summary |
| 2 manual-test | Host `./build_and_start_app.sh dev` / port claims |

Plan-only or blocker-wait sessions do not count as active workers.

After manual-test, stop or leave the stack only as the manual-test skill says.
Remove the worktree or its claim under
`~/.cache/life-manager/dev-port-claims/` when the story is done so the next
worker can claim a slot. See [docs/development_faq.md](../../../docs/development_faq.md#parallel-worktrees-manual-test).

## Story PR create (workers)

Do not use `open-pr` (base is always `main`). From the story worktree:

```bash
git push -u origin HEAD
gh pr create --base <feature-branch> --head <story-branch> \
  --title "<story title>" \
  --body "$(cat <<'EOF'
## Summary
- …

## Test plan
- [ ] …

Closes #<n>
EOF
)"
```

## Local tests in review-loop

Story PRs target the feature branch, so GitHub Actions does **not** run CI for
them. Workers must run local unit and integration tests inside
**pr-review-loop** (each fix round and the final clean round).

Commands: [docs/agents/testing.md](../../../docs/agents/testing.md).

| Change area | Required local runs |
|-------------|---------------------|
| `frontend/` | `cd frontend && npm ci && npm run test:run`; `npm run lint` when UI changed |
| backend Rust | `./backend/scripts/write_rev.sh`; `cargo test --lib --workspace --manifest-path backend/Cargo.toml`; `cd backend && cargo test --test '*'` |
| generated DTOs | `./backend/scripts/export_ts_bindings.sh` + `git diff --exit-code -- frontend/lib/api/generated/` |
| docs / CI YAML only | No app suites; worker must say so in the PR or boss note |

Do not run `#[ignore]` suites unless the story needs them. Boss must not merge
when required suites failed or were skipped without a docs/CI-only reason.

## Merge story into feature

Boss only, after review-loop (incl. local tests) + summary + manual-test pass:

```bash
gh pr merge <pr> --squash --delete-branch
```

Then `git fetch origin <feature-branch>` before the next worktree create.

## Feature PR body

Template for create/edit:

```markdown
## Summary
<one short paragraph>

## Stories
| Issue | Title | PR | Status |
|-------|-------|----|--------|
| #n | … | #p | merged / in progress / queued |

## Flagged decisions
- <decision>: <choice> — <reason>; human should confirm if wrong

## Test plan
- [ ] Review flagged decisions
- [ ] Smoke feature on a fresh checkout of this branch
```

Refresh after each story merge. Never merge this PR in the skill.

## Sending messages to a worker

```bash
tmux send-keys -t gh-<n> -l "From the boss session: <text>"
sleep 0.5
tmux send-keys -t gh-<n> Enter
```

## Watcher

```bash
.cursor/skills/deliver-feature/scripts/watch.sh gh-122 gh-126
```

Exits with `IDLE: <session>` or `GONE: <session>`. Run as a background job so
exit wakes the boss. One watcher at a time.

## Health poll note

`GET /api/health` may return `up` or `"up"`. Accept either.
