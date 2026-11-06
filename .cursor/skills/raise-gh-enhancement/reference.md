# raise-gh-enhancement — reference

Templates and `gh` examples for the skill. Keep issue prose in ASD-STE100.
Do not apply STE inside fenced Gherkin or code identifiers.

## Repo and labels

```bash
# Resolve default repo from the current remote when possible
gh repo view --json nameWithOwner -q .nameWithOwner

# Prefer explicit repo if needed
REPO=mikeyjay39/life-manager
```

Use label **`enhancement`** on the epic and every story.

## Create parent epic

```bash
gh issue create --repo "$REPO" --label enhancement \
  --title "short feature name" \
  --body-file /tmp/epic-seed.md
```

Seed body may be short. Step 6 of the skill replaces it with the full epic.

## Attach to an existing issue

```bash
gh issue view 104 --repo "$REPO" --json number,title,body,url
gh issue edit 104 --repo "$REPO" --add-label enhancement
```

Then create children with `--parent 104`.

## Create a story sub-issue

```bash
gh issue create --repo "$REPO" --parent "$EPIC_NUMBER" --label enhancement \
  --title "Feature area: short story goal" \
  --body-file /tmp/story-01.md
```

## Rewrite epic after children exist

```bash
gh issue edit "$EPIC_NUMBER" --repo "$REPO" --body-file /tmp/epic.md
```

## Verify sub-issues

```bash
gh api graphql -f query='
query($owner:String!,$name:String!,$number:Int!) {
  repository(owner:$owner,name:$name) {
    issue(number:$number) {
      title
      subIssues(first:30) {
        nodes { number title url }
      }
    }
  }
}' -f owner=OWNER -f name=REPO_NAME -F number="$EPIC_NUMBER" \
  --jq '.data.repository.issue.subIssues.nodes[] | "#\(.number) \(.title) \(.url)"'
```

Replace `OWNER` / `REPO_NAME` from `nameWithOwner` (for example `mikeyjay39` /
`life-manager`).

## Epic body template

```markdown
## Summary
<One short paragraph: what the epic delivers.>

## Product decisions (locked)
| Decision | Choice |
|----------|--------|
| Whose data? | ... |
| Aggregates | ... |
| MVP scope | ... |
| Out of scope | ... |

## Use cases (epic)
1. ...
2. ...

## Story tickets (implementation order)

| # | Story | Suggested branch |
|---|--------|------------------|
| #N | ... | `feature/<epic>-...` |

**Parallelism:** <which stories may overlap>

## Stacked PR note
Prefer small PRs in the order above.

## Original request
<Paste the human’s original high-level text.>
```

## Story body template

```markdown
## Parent
Part of epic #<EPIC> (<epic title>).

## Goal
<One short paragraph.>

## Use cases
1. As a ..., I ... so that ...
2. ...

## Requirements
- ...
- Align with domain / application / infrastructure layers in backend/AGENTS.md
  when this story touches the backend.
- Frontend stories: tenant UI under frontend/tenants/<id>/; shared shell in app/.

## Acceptance criteria

Use a gherkin fenced block in the real issue body:

    Scenario: <name>
      Given ...
      When ...
      Then ...

## Edge cases
- ...

## Suggested branch
`feature/<epic-slug>-<story-slug>`

## Depends on
#A, #B (or None)

## Out of scope
...
```

In real `/tmp/story-*.md` files, wrap the scenarios in a `gherkin` code fence.

## Suggested story slices (full-stack)

Use this order unless the feature is UI-only or API-only:

1. Domain model + DB migration
2. Create/list API + ts-rs bindings + tests + api.md
3. Update/delete API (if needed)
4. UI page skeleton + menu navigation
5. Primary UI flows (forms, lists)
6. Secondary UI (charts, edit/delete, toggles)
7. Related domain on the same screen (if any)
8. Agent docs + architecture diagram

Branch names: `feature/<epic-or-issue>-<short-slug>` (example:
`feature/104-health-member-api`).

## Worked example (Health Manager)

Calibration only — do not hard-code this feature into every run.

| Step | What happened |
|------|----------------|
| Seed | Issue #104 described Health Manager at a high level |
| Discovery | Use cases, `HealthMember` / `HealthReading` / doctor visits, metric API + imperial UI conversion |
| Locked decisions | Per-HealthMember ownership; deactivate not hard-delete; single Health screen |
| Stories | #113 API → #105 domain readings → #106–#107 APIs → #108 skeleton → #115 members UI → #109–#111 vitals UI → #114 visits → #112 docs |
| Epic rewrite | Decisions table + ordered story map on #104 |

Patterns to copy:

- Sub-issues via `gh issue create --parent`
- Gherkin acceptance criteria
- Explicit **Depends on** / **Out of scope**
- Stacked branches called out on each story
- One batch of follow-up questions after defaults were applied

## Anti-patterns

- One mega-issue with no children
- Stories that only say “implement Health Manager” with no AC
- Coupling a new aggregate to Document tables or handlers without a real need
- Starting `cargo` / Expo implementation inside this skill
- State-changing git (`commit`, `push`, `checkout`, …)
