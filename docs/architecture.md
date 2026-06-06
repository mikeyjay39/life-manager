# Architecture

Overview of the Life Manager stack: backend workspace layout, HTTP routing, production deployment, and how dev/test/prod profiles differ.

## Backend workspace

The backend is a Cargo workspace. The **`mikeyjay-server`** binary crate wires Axum routes and depends on two library crates under **`backend/libs/`**. Integration tests live in **`backend/tests/`** and exercise the assembled app.

```mermaid
flowchart TB
  subgraph backend["backend/"]
    bin["mikeyjay-server (binary)\nsrc/lib.rs, src/main.rs"]
    subgraph libs["libs/"]
      auth["auth\nJWT login, auth middleware"]
      lm["life-manager\ndocuments, DB, app state"]
    end
    tests["tests/ (integration)"]
  end

  bin --> auth
  bin --> lm
  lm --> auth
  tests --> bin
  tests --> auth
  tests --> lm
```

| Crate | Role |
|-------|------|
| **`mikeyjay-server`** | HTTP server entrypoint; top-level routes (`/api/health`, `/api/version`, `/life-manager/...`) |
| **`auth`** | Authentication router and JWT helpers; mounted under `/life-manager/api/v1/auth` |
| **`life-manager`** | Domain logic, Diesel/SQLite, document API; nests `/api/v1` feature routers |

Diesel migrations and schema live in **`backend/libs/life-manager/`** (see **`backend/diesel.toml`**).

## HTTP routing

In production, browsers hit the **gateway** (nginx). The gateway forwards API traffic to the Rust server and static assets to the frontend container. In dev, the Expo app usually talks directly to the backend on **`APP_PORT`**.

```mermaid
flowchart LR
  subgraph client["Client"]
    fe["Expo frontend\nAPI_V1_PREFIX"]
  end

  subgraph gateway["nginx gateway (prod)"]
    loc1["/life-manager/api/*"]
    loc2["/api/health, /api/version"]
    loc3["/ → static frontend"]
  end

  subgraph server["mikeyjay-server (Axum)"]
    r1["/life-manager\nlife_manager_api_router()"]
    r2["/api/v1\nauth + documents"]
    r3["/api/health, /api/version\n(top-level)"]
  end

  fe -->|"same-origin /life-manager/api/v1/..."| loc1
  loc1 --> r1 --> r2
  loc2 --> r3
```

### Route map

| Public path | Handler |
|-------------|---------|
| `/life-manager/api/v1/auth/login` | `auth` crate — login |
| `/life-manager/api/v1/documents` | `life-manager` — list / create documents |
| `/life-manager/api/v1/documents/{id}` | `life-manager` — get document by UUID |
| `/api/health` | Top-level — liveness |
| `/api/version` | Top-level — git commit |

The v1 API prefix is defined once in the frontend as **`API_V1_PREFIX`** (`frontend/constants/config.ts`). Ops endpoints stay at **`/api/*`** so health checks do not move when product APIs are namespaced.

## Production deployment

Compose **prod** profile runs three main services plus an optional OCR sidecar.

```mermaid
flowchart TB
  browser["Browser / mobile"]
  gateway["gateway (nginx)\n:NGINX_PORT"]
  frontend["frontend (static Expo web)\n:FRONTEND_PORT"]
  api["life-manager (Rust API)\n:APP_PORT"]
  db[("SQLite\nbackend/data")]
  ocr["tesseract (optional OCR)"]

  browser --> gateway
  gateway -->|"/"| frontend
  gateway -->|"/life-manager/api, /api"| api
  api --> db
  api -.->|"TESSERACT_ENABLED"| ocr
```

The prod frontend build defaults to an empty **`EXPO_PUBLIC_API_BASE_URL`**, so the browser uses same-origin paths (via the gateway). Override with a full origin when the API is on another host (e.g. physical devices on the LAN).

See **`docker-compose.yml`** header comments and **`nginx/templates/default.conf.template`** for proxy rules.

### CI deploy to AWS (merge to `main`)

Workflow: [`.github/workflows/main.yml`](../.github/workflows/main.yml). Pull requests run tests only. A push to **`main`** runs tests, then builds and pushes each prod image to ECR only when its source tree changed (`backend/**`, `frontend/**`, `nginx/**`); Lightsail deploy always runs after that job.

```mermaid
sequenceDiagram
  participant Dev as Developer
  participant GH as GitHubActions
  participant ECR as AmazonECR
  participant LS as Lightsail

  Dev->>GH: merge to main
  GH->>GH: frontend, backend, integration tests
  GH->>GH: paths-filter backend frontend nginx
  opt backend changed
    GH->>ECR: push life-manager-backend latest and sha
  end
  opt frontend changed
    GH->>ECR: push life-manager-frontend latest and sha
  end
  opt gateway changed
    GH->>ECR: push life-manager-gateway latest and sha
  end
  GH->>LS: SSH git pull and deploy-prod-lightsail.sh
  LS->>ECR: docker compose pull prod images
  LS->>LS: docker compose up -d prod profile
```

Image URLs are set in **`.prod.env`** at the repo root (`LIFE_MANAGER_*_IMAGE`). The deploy script is [`scripts/deploy-prod-lightsail.sh`](../scripts/deploy-prod-lightsail.sh).

## Dev, test, and prod profiles

**`build_and_start_app.sh`** and **`backend/start_backend.sh`** select a profile; each loads **`.<profile>.env`** at the repo root.

```mermaid
flowchart TB
  subgraph dev["dev profile"]
    dev_be["Backend: cargo run on host\n:APP_PORT (3000)"]
    dev_fe["Frontend: npx expo start on host\n:8080"]
    dev_compose["Compose: frontend_dev (optional)"]
    dev_url["API URL: http://localhost:3000"]
    dev_be --- dev_fe
    dev_fe --> dev_url
  end

  subgraph test["test profile"]
    test_be["Backend: cargo build only\n(no server started)"]
    test_fe["Frontend: Expo on host"]
    test_compose["Compose: none"]
  end

  subgraph prod["prod profile"]
    prod_gw["Entry: gateway :NGINX_PORT (80)"]
    prod_fe["frontend container (static)"]
    prod_be["life-manager container\n:APP_PORT"]
    prod_url["API URL: same origin as gateway\n(relative /life-manager/api/v1/...)"]
    prod_gw --> prod_fe
    prod_gw --> prod_be
    prod_fe --> prod_url
  end
```

| Profile | Backend | Frontend | Compose services | Typical API base |
|---------|---------|----------|------------------|------------------|
| **dev** | Host **`cargo run`** | Host Expo | `frontend_dev` (optional) | `http://localhost:3000` |
| **test** | **`cargo build`** only | Host Expo | *(none)* | N/A (integration tests spin up the app) |
| **prod** | Container **`life-manager`** | Container **`frontend`** via **`gateway`** | `life-manager`, `frontend`, `gateway` | Same origin as gateway (empty **`EXPO_PUBLIC_API_BASE_URL`**) |

More detail: [`README.md`](../README.md) (how to run), [`development_faq.md`](development_faq.md) (API URLs, mobile, TLS).
