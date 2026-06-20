# life-manager

## Dev Container
The dev container contains all dependencies needed and mounts your neovim config. You can build and run the app
from there as well run the integration tests.

Scripts live in [`dev-container/`](dev-container/). They resolve their own directory, so run them from the repo root.

- **Build** (includes host user/GID args, `--network=host`, and `--no-cache`):
```bash
./dev-container/build-image.sh
```

- **Run** and connect to the container:
```bash
./dev-container/run.sh
```

## How to run

### Full stack (`build_and_start_app.sh`)

From the repository root (not inside the dev container if you rely on host Docker):

```bash
./build_and_start_app.sh <test | dev | docker-dev | prod> [--build-image] [--with-tesseract]
```

This starts `backend/start_backend.sh` and `frontend/start_frontend.sh` in parallel (except **docker-dev**, which runs only the backend script and serves the frontend from Docker). Each script receives the same profile. Compose and the backend load variables from `.<profile>.env` at the repo root (for example `.prod.env`). The **docker-dev** profile uses the same **`.dev.env`** file as **dev**.

| Profile | Backend | Frontend | Docker Compose (`docker-compose.yml`) |
|--------|---------|----------|----------------------------------------|
| **prod** | Rust server in container `life-manager` | Static app in container `frontend`; users normally hit **`gateway`** | `life-manager`, `frontend`, `gateway`, `loki`, `grafana` |
| **dev** | **`cargo run`** on the host (see `APP_PORT`) | **`npx expo start`** on the host (default Expo port **8080**) | *(none — `frontend_dev` is stopped on startup)* |
| **docker-dev** | **`cargo run`** in container `life_manager_dev` (source baked into image; images rebuilt on every start) | Expo in container **`frontend_dev`** | `life_manager_dev`, `frontend_dev`, `loki`, `grafana` |
| **test** | `cargo build` only; the API is **not** started by these scripts; **no** Compose services are started | Expo on the host (same as dev) | *(none)* |

**Ports (defaults)** — override `APP_PORT` / service ports in `.<profile>.env`, or set Compose variables (for example `NGINX_PORT`) when invoking Docker Compose.

| Port / setting | What uses it |
|----------------|----------------|
| **`APP_PORT`** (default **3000**) | Backend HTTP: host process in **dev**, published by **`life_manager_dev`** in **docker-dev**, published by container **`life-manager`** in **prod**. |
| **`NGINX_PORT`** (default **80**) | Host port for **`gateway`** in **prod** (`/` → frontend, `/life-manager/api` → v1 API, `/api` → health/version, `/logs/` → Grafana). Often the main browser URL. |
| **`FRONTEND_PORT`** (default **8080**) | Host port for the **`frontend`** container in **prod** (direct access; prefer **`gateway`** for one origin). Same variable maps **`frontend_dev`** (Expo in Docker) in **docker-dev**. Host Expo in **dev**. |
| **`TESSERACT_PORT`** (default **8884** in sample env files) | Published when the optional **`tesseract`** Compose service is running. |
| **`TESSERACT_ENABLED`** (default **`false`** in sample env files) | When **`false`**, the backend uses **`NoOpDocumentTextReader`** (embedded PDF text only; no HTTP OCR). When **`true`**, **`TESSERACT_URL`** must point at the sidecar. **`start_backend.sh --with-tesseract`** forces **`TESSERACT_ENABLED=true`** and adds Compose **`--profile tesseract`**. |
| **`LOKI_PORT`** (default **3100**) | Loki HTTP API on **localhost only** (`127.0.0.1`); used by the Docker Loki logging driver to ship container logs. |
| **`GRAFANA_PORT`** (default **3001**) | Grafana UI for querying logs (avoids clashing with **`APP_PORT`** **3000**). In **prod**, use **`https://<domain>/logs/`** via the gateway (set **`GRAFANA_ROOT_URL`** in `.prod.env` to match). In **docker-dev**, open `http://localhost:${GRAFANA_PORT:-3001}` directly. Login with **`GRAFANA_ADMIN_USER`** / **`GRAFANA_ADMIN_PASSWORD`**. |

### Observability (Loki + Grafana)

**prod** and **docker-dev** start **Loki** and **Grafana** automatically. Application containers use the [Loki Docker logging driver](https://grafana.com/docs/loki/latest/send-data/docker-driver/) (installed by `backend/start_backend.sh` and `scripts/deploy-prod-lightsail.sh`) to push stdout/stderr to Loki. `docker logs` still works (the driver keeps local JSON log files by default).

Grafana is provisioned from [`observability/grafana/provisioning/`](observability/grafana/provisioning/): a **Loki** datasource and a **Container Logs** dashboard (set as the default home view).

- **Prod:** open `https://<domain>/logs/` (via the gateway). **`GRAFANA_ROOT_URL`** in `.prod.env` must match that URL (scheme + host + trailing `/logs/`). Direct access on **`GRAFANA_PORT`** is still published if needed.
- **docker-dev:** open Grafana at `http://localhost:${GRAFANA_PORT:-3001}`.
- Sign in with **`GRAFANA_ADMIN_USER`** / **`GRAFANA_ADMIN_PASSWORD`** from `.<profile>.env`.
- After login, the **Container Logs** dashboard shows live streams for `{compose_project="life-manager"}`. Use the **Service** dropdown to filter (e.g. `life_manager_dev`).
- **Connections → Data sources** lists **Loki** (provisioned; not editable in the UI).
- Loki stays bound to localhost on the host (`127.0.0.1:${LOKI_PORT:-3100}`).
- **Disk:** Loki and Grafana use named Docker volumes (`loki_data`, `grafana_data`); monitor disk use on long-running hosts.

Host-only processes (**dev** profile `cargo run`, host Expo) are not shipped to Loki unless you add a separate collector (e.g. Promtail).

**If Loki does not appear as a datasource** (often after Grafana ran once before provisioning was in place), restart or reset the Grafana volume:

```bash
docker compose -f docker-compose.yml --env-file .dev.env --profile docker-dev restart grafana
```

If the datasource is still missing:

```bash
docker compose -f docker-compose.yml --env-file .dev.env --profile docker-dev stop grafana
docker compose -f docker-compose.yml --env-file .dev.env --profile docker-dev rm -f grafana
docker volume rm life-manager_grafana_data
docker compose -f docker-compose.yml --env-file .dev.env --profile docker-dev up -d --build loki grafana
```

`docker volume rm` fails while a container still references the volume — stop and remove the Grafana container first (`rm -f grafana` above).

Verify provisioning inside the container:

```bash
docker exec life_manager_grafana ls /etc/grafana/provisioning/datasources/
docker logs life_manager_grafana 2>&1 | grep -i provision
```

### Optional Tesseract (OCR sidecar)

Sample env files default **`TESSERACT_ENABLED=false`**, so **`docker compose`** does not need to run the **`tesseract`** service for normal dev/test/prod. To enable OCR (images or scanned PDFs), run Compose with the extra profile and point the API at the container, for example:

```bash
docker compose -f docker-compose.yml --env-file .prod.env --profile prod --profile tesseract up -d
```

Pass **`backend/start_backend.sh dev --with-tesseract`** (or **prod** / **docker-dev**) to start the stack **and** the sidecar in one step.

The Compose file is **`docker-compose.yml`** at the repo root; its header comments describe gateway routing and **`EXPO_PUBLIC_API_BASE_URL`**. For **prod**, `start_backend.sh` runs `docker compose build` for `life-manager`, `gateway`, and `frontend` before `up` when **`--build-image`** is passed so nginx templates stay in sync with the repo. **docker-dev** always rebuilds `life_manager_dev` and `frontend_dev` before `up`.

**Dev note:** Use **dev** for host `cargo run` + host Expo, or **docker-dev** for both in Docker (same **`.dev.env`**). Switching profiles stops the other workflow’s containers and frees ports.

**Prod note:** `frontend/start_frontend.sh` exits immediately in prod and docker-dev; the UI is served from Docker.

Architecture diagrams (workspace layout, routing, deployment): [`docs/architecture.md`](docs/architecture.md).

More detail on API URLs and mobile: [`docs/development_faq.md`](docs/development_faq.md).

### Backend app only
```bash
cd backend && cargo run
```

Uses `APP_PORT` from your environment (see `.dev.env` at the repo root for profile defaults, or `backend/.env` for bare `cargo run`).

## Example API calls

```bash
# Health check
curl --location 'http://127.0.0.1:3000/api/health'

# Get a document by UUID
curl --location 'http://127.0.0.1:3000/life-manager/api/v1/documents/550e8400-e29b-41d4-a716-446655440000'

# Create a document
curl -X POST -H "Content-Type: multipart/form-data" \
  -F "json={\"title\":\"MYTEST\",\"content\":\"this is an example\"}" \
  -F "file=@README.md" \
  'http://127.0.0.1:3000/life-manager/api/v1/documents'
```


## Installation

### Diesel

See this tutorial: https://diesel.rs/guides/getting-started

Install the Diesel command-line interface for SQLite:

```bash
cargo install diesel_cli --no-default-features --features sqlite
```

Set up the database and run migrations:

```bash
cd backend
export DATABASE_URL=./data/test.db
diesel setup
diesel migration run
cd libs/auth
diesel migration run --config-file diesel.toml
```

The server and integration tests also apply both migration sets automatically on startup.

## Planned Features

#### Document Manager
* Store documents and associate them with family members
* Automate reminders to alert users before documents expire

### Medical Manager
* Diary of doctor visits
* Track personal health data (height, weight, etc) over time and visualize with charts

### Location Manager
* Integrate with Google's "find my device" feature to show location of everyone on a map

### Car Manager
* Diary of mechanic visits and history

### Receipt Manager
* Upload and store receipts. Possibly parsing info such as vendor name, date, and amount from
the receipt image

```mermaid
---
title: Aggregates, Entities and Value Objects
---

flowchart TD

  M-->Did
  D-->Mid
  D-->A

    M[Member]
    D[Document]
    Mid[MemberId]
    Did[DocumentId]
    A[Alert]
```
