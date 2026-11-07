---
name: raise-gh-enhancement
description: >-
  Turns a high-level feature description into a GitHub enhancement epic and
  story-sized sub-issues (use cases, requirements, acceptance criteria, edge
  cases). Use when asked to raise-gh-enhancement, break a feature into GitHub
  stories, or create an epic with sub-issues from a product idea.
disable-model-invocation: true
---

# Raise GH enhancement

Turn a high-level feature idea into a GitHub **enhancement epic** and
**story-sized sub-issues**. Help the human discover use cases, requirements,
acceptance criteria, and edge cases first. Then create the tickets.

Write all prose in ASD-STE100. Do not apply STE to code identifiers or quoted
acceptance-criteria text.

Templates and `gh` examples: [reference.md](reference.md).

```text
Human: high-level feature (text and/or existing issue URL)
  |-- read repo context (README, api.md, similar domain)
  |-- draft epic decisions + story split
  |-- discover with human (batch questions; defaults OK)
  |-- create/update parent issue (label: enhancement)
  |-- create sub-issues with --parent (story tickets)
  |-- rewrite parent with story map + locked decisions
  |-- report URLs + remaining questions (one batch)
```

## Guardrails

- Do **not** implement product code in this skill run.
- Do **not** commit or push (this skill only creates GitHub issues). See [AGENTS.md](../../../AGENTS.md).
- Creating and editing GitHub issues with `gh` is allowed.
- Prefer stacked, mergeable story slices that match repo layers:
  domain/DB → API → UI skeleton → UI features → docs
  (see [backend/AGENTS.md](../../../backend/AGENTS.md)).
- Batch clarifying questions. Lock defaults into tickets when the human is
  hands-off.
- Do not invent coupling to Document (or other aggregates) unless the feature
  needs it. Read the current domain first.
- Do not implement items from [docs/todos.md](../../../docs/todos.md) unless
  the human asked for that feature in this run.

## Inputs (ask once if missing)

| Field | Default | Notes |
|-------|---------|-------|
| Feature summary | — | Short product goal from the human |
| Existing issue | none | Optional URL or number to use as the epic parent |
| Repo | current `gh` remote | Usually `mikeyjay39/life-manager` |

## Checklist

Copy and track progress:

```text
- [ ] Collect inputs (summary; optional existing issue)
- [ ] Read repo context (README, api.md, nearest domain)
- [ ] Draft use cases, requirements, AC, edge cases, story split
- [ ] Confirm or lock product decisions with the human
- [ ] Create or update parent epic (label: enhancement)
- [ ] Create story sub-issues (--parent)
- [ ] Rewrite parent with decisions table + story map
- [ ] Report epic URL, child URLs, order, open questions
```

## Steps

### 1. Collect inputs

- Take the high-level description from the human message.
- If they give an issue URL or number, treat that issue as the epic parent.
- If the summary is missing, ask for it once. Do not start ticket creation yet.

### 2. Read repo context

From the repo root, read at least:

- [README.md](../../../README.md) — planned features and aggregate diagram
- [docs/agents/api.md](../../../docs/agents/api.md) — existing routes and auth
- Nearest existing domain (for example Document under
  `backend/libs/life-manager/` and `frontend/tenants/life-manager/`)

Note ownership patterns, layer rules, and UI placement so stories fit this
codebase.

### 3. Discover the feature

Draft and show the human (or lock defaults if they already answered):

1. **Actors** and **use cases**
2. **Domain boundaries** (new aggregates; what stays out of Document)
3. **MVP vs out of scope**
4. **Requirements** (API shape, UI surfaces, units, auth)
5. **Edge cases**
6. **Story split** — ordered tickets with suggested branch names and depends-on

Typical split for a full-stack feature:

| Slice | Example |
|-------|---------|
| Domain + DB | Aggregate, migration, validation |
| API | Create/list (and update/delete if needed), ts-rs, tests |
| UI skeleton | Route + menu entry + empty sections |
| UI features | Forms, lists, charts, edit/delete |
| Docs | AGENTS.md, api.md, architecture diagram |

Align titles and bodies with the templates in [reference.md](reference.md).

Batch all open questions in **one** message. Prefer sensible defaults over
blocking. When the human answers, update the draft before you create issues.

### 4. Create or update the parent epic

- **New epic:** `gh issue create --label enhancement` with a short title and a
  temporary body (summary + original request is enough).
- **Existing issue:** `gh issue edit <n> --add-label enhancement` if needed.
  Keep the original request text in the final epic body.

Record `EPIC_NUMBER` and `EPIC_URL`.

Do not create child issues until discovery is good enough to write actionable
stories (defaults locked or human confirmed).

### 5. Create story sub-issues

For each story in order:

```bash
gh issue create --parent "$EPIC_NUMBER" --label enhancement \
  --title "..." --body-file /tmp/story-NN.md
```

Each body must include the sections from [reference.md](reference.md)
(parent link, goal, use cases, requirements, acceptance criteria, edge cases,
suggested branch, depends on, out of scope).

Acceptance criteria use Gherkin `Scenario:` blocks.

Stories must be independently actionable. Prefer small stacked PRs over one
giant ticket.

### 6. Rewrite the parent epic

After children exist, replace the parent body with:

- Summary
- Locked decisions table
- Epic use cases
- Ordered story table (issue numbers, titles, suggested branches)
- Parallelism notes
- Original request

Use `gh issue edit "$EPIC_NUMBER" --body-file /tmp/epic.md`.

Verify children are linked:

```bash
gh api graphql -f query='...'   # see reference.md
```

### 7. Report

Tell the human:

- Epic URL
- Child issue URLs in build order
- What was locked by default
- Any remaining questions in one list

Stop. Do not start implementation unless the human asks in a new message.

## Done when

- [ ] Parent issue exists, labeled `enhancement`
- [ ] Sub-issues are linked under the parent
- [ ] Each child is a story ticket with AC and edge cases
- [ ] Human has URLs and the build order
