---
name: deliver-feature
description: >-
  Boss agent delivers a GitHub feature issue via a feature branch and story
  workers in tmux worktrees. Stories PR against the feature branch (not main),
  then run pr-review-loop (with local unit and integration tests),
  pr-summary-for-human, and manual-test. Leaves story PRs open for human
  merge review; keeps feature→main PR open unmerged. Use when asked to
  deliver-feature, run the overnight feature pipeline, or coordinate story
  workers for a GitHub epic.
disable-model-invocation: true
argument-hint: '<#n | issue-url>'
---

# Deliver feature

This session is the **boss**. Workers implement stories. You create the feature
branch, spawn workers, run the pipeline gates, leave **story → feature** PRs
open for the human to merge, and keep a **feature → main** PR open. **Never
merge** a story PR into the feature branch (or any stacked base). **Never
merge** the feature PR into `main` in this skill.

Write all prose in ASD-STE100. Do not apply STE to code identifiers or quoted
text.

Details: [reference.md](reference.md). Worker prompt:
[references/worker-prompt.md](references/worker-prompt.md).

```text
Feature issue (#n or URL)
  |-- sub-issues? yes -> stories = sub-issues
  |               no  -> single story = feature issue
  |-- feature branch from origin/main (slug from title)
  |-- open/refresh feature -> main PR (DO NOT MERGE)
  |-- dispatch <=3 active workers (tmux + worktree + cursor-agent)
  |-- per story: implement -> PR vs feature -> review-loop
  |              (local unit + integration tests each round)
  |              -> summary-for-human -> manual-test (<=2 parallel)
  |              -> leave story PR open for human merge; do not merge
  |-- finalize feature PR body + Flagged decisions; stop
```

## Guardrails

- **Git (skill exception in [AGENTS.md](../../../AGENTS.md)):** commit and
  push are allowed for this skill run. Do **not** merge any PR: not
  story → feature, not story → a stacked base, and not feature → `main`.
  Do not force-push shared history. Do not run `gh pr merge`.
- Do **not** use **prod** or Lightsail.
- Do **not** run write SQL or `diesel migration run`.
- At most **3** active workers. At most **2** concurrent **manual-test** /
  host `dev` stacks ([`.cursor/rules/dev-stack-limits.mdc`](../../rules/dev-stack-limits.mdc)).
- Story PRs target the **feature branch**, not `main`. Do **not** use
  [`.cursor/skills/open-pr/`](../open-pr/) as-is (it hardcodes `main`).
- Hands-off: do not block on human AC approval. Lock testable AC from the
  issue. Put major product guesses in **Flagged decisions** on the feature PR.
- Leave cleaned port claims when workers finish so the 2-stack cap stays free.

## Checklist

```text
- [ ] Parse feature issue from $ARGUMENTS
- [ ] Load stories (sub-issues or the feature itself)
- [ ] Order by blockers / layer stack
- [ ] Create or update feature branch from origin/main
- [ ] Open or refresh feature -> main PR (never merge)
- [ ] Write worker prompts; spawn waves (<=3 active)
- [ ] Per story: wait for PR + review-loop (incl. local tests) + summary +
      manual-test (proof comment with uploaded screenshots)
- [ ] Leave story PR open for human merge; do not gh pr merge
- [ ] Refresh feature PR (story map, proof, Flagged decisions)
- [ ] Report feature PR URL + story PRs awaiting human merge
```

## Steps

### 1. Parse the feature

Take `$ARGUMENTS`: a number, `#n`, or a GitHub issue URL.

```bash
gh issue view <n|url> --json number,title,body,labels,url,state
gh repo view --json nameWithOwner -q .nameWithOwner
```

If the URL is a different repo, stop and tell the human.

### 2. Load stories

Fetch sub-issues (GraphQL). See [reference.md](reference.md#sub-issues).

- If sub-issues exist: each open (or still-needed) sub-issue is a **story**.
- If none: the feature issue is the **single story**.

For each story, record number, title, body, URL, and draft **testable AC** from
the body / checklist / comments.

### 3. Order the stories

1. Read “Blocked by #n” / “Depends on #n” in bodies and sub-issue links.
2. If unmarked, use layer order: domain/DB → API → UI skeleton → UI features →
   docs ([backend/AGENTS.md](../../../backend/AGENTS.md)).
3. Queue blocked stories until their blockers are on the PR base the worker
   needs. Prefer waiting until the human merges the blocker into the feature
   branch. If the human has not merged yet and the dependent must start, base
   the dependent on the **blocker story branch** and open a **stacked** PR
   (base = blocker branch). Still do **not** merge that stacked PR.

### 4. Create the feature branch

Slug = lowercase title words joined with `-` (short). Example: `Car Manager` →
`car-manager`.

From the **main repo checkout** (unlocked git-crypt):

```bash
git fetch origin main
# create only if missing on remote/local
git checkout -B <feature-branch> origin/main
git push -u origin <feature-branch>
```

Keep working from that checkout as the boss control root. Worker worktrees base
on `origin/<feature-branch>`, not `main` (or on a blocker story branch when
stacking).

### 5. Open the feature → main PR

```bash
gh pr list --head <feature-branch> --base main --state open --json number,url
# if none:
gh pr create --base main --head <feature-branch> \
  --title "<feature title>" \
  --body-file <scratchpad>/feature-pr-body.md
```

Body must include a story map and an empty **Flagged decisions** section (see
[reference.md](reference.md#feature-pr-body)). **Never** `gh pr merge` this PR.

### 6. Prepare names

| Story   | Session  | Branch                         | Worktree path pattern                          |
|---------|----------|--------------------------------|------------------------------------------------|
| `GH-n`  | `gh-n`   | `<handle>/gh-n-<slug>`         | `<repo>.<handle>-gh-n-<slug>` beside main root |

`handle` = GitHub login or existing `*/gh-*` branch prefix
(`git branch --list '*/gh-*'`).

Scratchpad: `<main-repo>/.cursor/deliver-feature/<feature-branch>/` (prompts,
status). Do not commit the scratchpad.

### 7. Spawn a worker wave

Active = implementing, review-loop, or summary. Plan-only / waiting on a blocker
does not count toward 3. Manual-test counts toward the **2** stack cap.

For each ready story while active count < 3:

1. Create worktree from `origin/<feature-branch>` (or blocker branch if
   stacking) + copy env / git-crypt keys
   ([reference.md](reference.md#worktree-setup)).
2. Write `<scratchpad>/prompts/gh-<n>.md` from
   [references/worker-prompt.md](references/worker-prompt.md).
3. Start tmux + `cursor-agent`:

```bash
tmux new-session -d -s gh-<n> -c <worktree>
tmux send-keys -t gh-<n> -l "cursor-agent --yolo --trust --workspace <worktree> \"\$(cat <scratchpad>/prompts/gh-<n>.md)\""
sleep 0.5
tmux send-keys -t gh-<n> Enter
```

4. After ~20s, `tmux capture-pane -p -t gh-<n>`. Fix trust/errors before more
   spawns.

### 8. Watch and pipeline

Start the watcher (background job that wakes you on exit):

```bash
.cursor/skills/deliver-feature/scripts/watch.sh gh-<a> gh-<b> …
```

Pass only sessions you expect to be busy.

When a worker reports an open story PR (or pane goes idle after “PR open”):

1. Confirm PR **base** is `<feature-branch>` (or the intended stacked base).
2. Confirm worker ran **pr-review-loop** (or run it in the worker session).
   As part of that loop, confirm the worker ran the **local unit and
   integration** commands from [docs/agents/testing.md](../../../docs/agents/testing.md)
   for every touched stack (see [reference.md](reference.md#local-tests-in-review-loop)).
   Do not mark the story ready for human merge if those suites failed or were
   skipped without a stated docs/CI-only reason.
3. Confirm **pr-summary-for-human** posted a general comment.
4. **Manual-test slot:** if fewer than 2 stacks are in manual-test, tell the
   worker to run [`.cursor/skills/manual-test/`](../manual-test/) with base
   `<feature-branch>` (see manual-test `$ARGUMENTS` / `MANUAL_TEST_BASE`). Else
   queue until a slot frees; free claims after proof.
5. Confirm the manual-test proof comment on the story PR shows **uploaded**
   screenshots (GitHub `user-attachments` / visible images), not only local
   `/tmp` filenames. If images are missing, send the worker back to
   `post-pr-proof.sh` before you mark the story ready.
6. On green proof: **do not merge**. Leave the story PR open for the human:

```bash
# Do NOT run: gh pr merge …
gh pr comment <story-pr> --body "Pipeline green (review-loop + local tests + manual-test proof). Ready for human merge review. Boss will not merge."
```

7. Do **not** close the story issue yourself via merge. The human merge (with
   `Closes #<n>`) closes it. Comment on the feature PR if proof failed.
8. Update the feature PR body (story status = ready for human merge, proof
   links, new Flagged decisions). Dispatch the next queued story.

Answer coordination questions yourself. Record product/arch guesses under
**Flagged decisions**; do not wait for the human mid-run.

### 9. Finish

When every story has green proof and an open PR awaiting human merge:

1. Refresh the feature → main PR: full story map, proof links, **Flagged
   decisions**, and each story PR URL marked ready for human merge.
2. Mark the feature PR ready for human review (not merged). Story commits land
   on the feature branch only after the human merges each story PR.
3. Remove finished worker worktrees / tmux sessions; clear stale port claims.
4. Report the feature PR URL, each story PR URL, and any open flags. State
   clearly that **no story was merged** by the boss.

## Reports

After setup, show:

| Session | Story | Worktree | State |
|---------|-------|----------|-------|
| `gh-n`  | title | path     | building / review / manual-test / queued / ready-for-human-merge |

Also list: feature branch, feature PR URL, locked AC one-liners, coordination
decisions, and `tmux attach -t gh-<n>`.
