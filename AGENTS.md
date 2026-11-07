# life-manager — agent instructions

Personal/family life-management app. **Documents**, **Health Manager**, and **Car Manager** ship today; more domains are planned (see [README.md](README.md)).

## Monorepo

| Path | Stack | Agent doc |
|------|--------|-----------|
| `backend/` | Rust (Axum, Diesel/SQLite) | [backend/AGENTS.md](backend/AGENTS.md) |
| `frontend/` | Expo / React Native (Vitest) | [frontend/AGENTS.md](frontend/AGENTS.md) |
| `dev-container/` | Docker dev environment (Rust, nvim, cursor-cli) | [README.md](README.md#dev-container) |
| Root | Docker Compose, orchestration scripts | [README.md](README.md) |

**Reference docs:** [docs/agents/api.md](docs/agents/api.md) · [docs/agents/testing.md](docs/agents/testing.md)

**Cursor skills:** [`.cursor/skills/manual-test/`](.cursor/skills/manual-test/) (dev stack + live branch proof) · [`.cursor/skills/open-pr/`](.cursor/skills/open-pr/) (PR vs main + summary body + manual-test proof) · [`.cursor/skills/add-tenant/`](.cursor/skills/add-tenant/) (new prod tenant) · [`.cursor/skills/raise-gh-enhancement/`](.cursor/skills/raise-gh-enhancement/) (epic + story sub-issues from a feature idea)

**Cursor rules (when editing matching files):** `.cursor/rules/rust-backend.mdc`, `.cursor/rules/frontend-react.mdc`, `.cursor/rules/dev-stack-limits.mdc`

## Docs to read first

| Doc | Use for |
|-----|---------|
| [README.md](README.md) | Run profiles, ports, Compose, Diesel setup, domain diagram |
| [docs/development_faq.md](docs/development_faq.md) | Multipart uploads, git-crypt, local HTTP / devices |
| [docs/todos.md](docs/todos.md) | Planned work — do not implement unless asked |
| [docs/architecture.md](docs/architecture.md) | Workspace layout, HTTP routing, deployment diagrams |
| [docs/agents/api.md](docs/agents/api.md) | HTTP routes, auth, API base URL |
| [docs/agents/testing.md](docs/agents/testing.md) | CI commands, BDD examples |
| [frontend/README.md](frontend/README.md) | Frontend setup |

## Critical Rules

These override everything else in agent docs.

### Git

**Default: read-only.** Agents do not stage, commit, or push in ordinary coding work.

**OK always:** `git status`, `git diff`, `git log`, `git show`, `git branch` (list), `git rev-parse`, `git describe`, `git fetch`.

**Skill exception:** when the user invokes a Cursor skill that needs git write (for example [`.cursor/skills/open-pr/`](.cursor/skills/open-pr/)), that skill run may use `git add`, `git commit`, and `git push -u origin HEAD` as the skill states. Follow the skill’s own git guardrails.

**Never run unless the user explicitly asks in the current message:** `git push --force`, `git reset --hard`, `git clean -fd`, `git rebase` / `git cherry-pick` onto shared history, `git commit --amend` of a commit you did not just create, `git config` (set/unset), delete or rename a published branch, merge to `main`.

Humans never force-push `main`. Prefer a PR over committing directly on `main`.

### Database (read-only for agents)

**Never run** write SQL or migration-apply CLI (`INSERT`…`REPLACE`, `diesel migration run`, `diesel database reset`, write `sqlite3`, etc.).

**OK:** `SELECT`, read-only Diesel inspect (`diesel migration list`, `diesel print-schema`), **authoring** `backend/libs/life-manager/migrations/*.sql` and `backend/libs/auth/migrations/*.sql`, **`cargo test`** / **`cargo run`** (app/test harness owns DB). Details: [backend/AGENTS.md](backend/AGENTS.md).

### Parallel workers (max 3)

When you coordinate multiple implementers (control-agent, parallel worktrees, or similar):

- Keep at most **3 active workers** at once.
- Queue further issues until a worker finishes or stops.
- **Active** means a tmux / `cursor-agent` session that is still implementing. Plan-only or idle-blocked sessions do not count.

Host `dev` full-stack limits are separate: see [`.cursor/rules/dev-stack-limits.mdc`](.cursor/rules/dev-stack-limits.mdc) and [docs/development_faq.md](docs/development_faq.md#parallel-worktrees-manual-test).

## Do not assume

Do not guess requirements, config, or intent. Read repo/docs first; if still unclear, **stop and ask** — do not invent behavior.

## Operations to avoid

Unless the user explicitly asks in the current message:

- `./build_and_start_app.sh prod`, prod Compose on real hosts, [scripts/deploy-prod-lightsail.sh](scripts/deploy-prod-lightsail.sh)
- git-crypt changes without user guidance ([docs/development_faq.md](docs/development_faq.md))

Run/test/deploy details: [README.md](README.md). CI on `main`: tests → ECR → Lightsail; humans never force-push `main`.

## Scope

- Do not implement [docs/todos.md](docs/todos.md) unless asked.
- Respect domain aggregates in [README.md](README.md) (Document, HealthMember, HealthReading, DoctorVisit, Car, CarMaintenanceEvent, etc.).

## Before changing code

- Small, focused diffs; match surrounding code.
- **Update agent docs** in the same change when workflows/conventions change ([AGENTS.md](AGENTS.md), stack `AGENTS.md`, `docs/agents/*`, `.cursor/rules/*.mdc`).
- Do not edit: `backend/libs/life-manager/src/schema.rs`, `backend/rev.txt`, `backend/target/`, `frontend/node_modules/`.
- No secrets in commits; see git-crypt in development FAQ.

## Definition of done

- [ ] Layer/layout rules ([backend/AGENTS.md](backend/AGENTS.md), [frontend/AGENTS.md](frontend/AGENTS.md))
- [ ] Tests per [docs/agents/testing.md](docs/agents/testing.md) when behavior changed
- [ ] **ASCII workflow diagrams** — new multi-step workflows (orchestration across layers, services, or non-trivial branching) include an ASCII UML diagram as a code comment on the entry point (handler, use case, screen/hook). Use a **sequence** diagram for call/message order; **activity** for branches/steps; both only when both help. Example: [`create_document` in `document_handler.rs`](backend/libs/life-manager/src/infrastructure/document/document_handler.rs). When changing existing workflows: update an existing diagram if the flow changed materially; add one if missing and non-trivial; skip trivial one-step CRUD.
- [ ] Agent docs updated if workflows changed
- [ ] User told if they must apply migrations or change env

## When unsure

See **Do not assume**. Use [docs/agents/api.md](docs/agents/api.md), stack `AGENTS.md`, and nearby `*_tests.rs` / `*.test.tsx`. Ask before large or ambiguous changes.
