# Development FAQ

## How do I send a post request containing a file and json with postman?
[See this](https://www.baeldung.com/postman-upload-file-json)

## Example of Postman request with file and json
![pre request script](./img/post_screenshot1.png)
![body form data](./img/post_screenshot2.png)

## Running Tests
### Integration Tests
```bash
cargo test --test '*'
```

### Unit Tests
```bash
cargo test --lib
```

## Secrets and Encryption
See [git-crypt](https://github.com/AGWA/git-crypt?tab=readme-ov-file#using-git-crypt)

Recommend adding users with their own gpg key:
```bash
git-crypt add-gpg-user USER_ID
```

After cloninng the repo, unlock with:
```bash
git-crypt unlock ~/life-manager-symetric.key
```
NOTE: key is stored in my password manager

## Docker Compose profiles and ports

Root-level **`docker-compose.yml`** groups services under Compose **profiles** (**`dev`**, **`prod`**, **`test`**, optional **`tesseract`**). **`build_and_start_app.sh`** (and **`backend/start_backend.sh`**) pass **`--profile <profile>`** and **`--env-file backend/.<profile>.env`** so variables like **`APP_PORT`** and **`TESSERACT_PORT`** apply consistently. The **`tesseract`** OCR sidecar is **not** included in **`dev`** / **`prod`** / **`test`** by default; enable it with **`--profile tesseract`** (and **`TESSERACT_ENABLED=true`**, or **`start_backend.sh --with-tesseract`**).

| Profile | Compose services | Typical host ports (see env / Compose defaults) |
|---------|------------------|--------------------------------------------------|
| **prod** | `life-manager`, `frontend`, `gateway` | **`NGINX_PORT`** → **`gateway`** (default **80**); **`APP_PORT`** → API container (default **3000**); **`FRONTEND_PORT`** → static **`frontend`** container (default **8080**) |
| **dev** | `frontend_dev` | **`FRONTEND_PORT`** → **`frontend_dev`** / Expo (default **8080**); backend on host **`APP_PORT`** (**3000**) via **`cargo run`** |
| **test** | *(none)* | **`start_backend.sh`** skips **`docker compose`** for this profile |

**Optional OCR:** add **`--profile tesseract`** so the **`tesseract`** service runs; set **`TESSERACT_ENABLED=true`** (sample env files default **`false`**, which selects **`NoOpDocumentTextReader`** in the backend—embedded PDF text still works; remote OCR does not). Example: **`docker compose --env-file backend/.prod.env --profile prod --profile tesseract up -d`**.

Orchestration summary: see **[`README.md`](../README.md)** (`build_and_start_app.sh`, containers vs host processes, and **prod** gateway entry). Architecture diagrams: **[`architecture.md`](architecture.md)**.

## Local HTTP (API URL)

The backend listens on plain HTTP (see **`APP_PORT`**, default **`3000`**). For **dev**, local Expo on the host usually talks to **`http://localhost:3000`**. For **prod**, browsers should use the **`gateway`** origin (default **`http://localhost`** if **`NGINX_PORT`** is **80**) — set **`EXPO_PUBLIC_API_BASE_URL`** to that same origin when building the prod frontend, or `http://localhost:<NGINX_PORT>` if you changed **`NGINX_PORT`**. Override with **`EXPO_PUBLIC_API_BASE_URL`** or Expo **`extra.apiUrl`** whenever the API is on another host or port.

- **Android Emulator:** run `adb reverse tcp:3000 tcp:3000` so the emulator’s `localhost:3000` reaches your machine. Use `http://localhost:3000` for the API URL when reversed.
- **Physical devices** on the LAN should set `extra.apiUrl` / env to an origin the device can reach (for example `http://192.168.1.10:3000`).

**Quick check**

```bash
# Ops endpoints (unchanged path)
curl -v --max-time 8 http://localhost:3000/api/health

# v1 API (dev: direct to backend; prod: use gateway origin + same path)
curl -v --max-time 8 'http://localhost:3000/life-manager/api/v1/documents'
```

### Frontend base URL

See `frontend/constants/config.ts` for resolution order (`EXPO_PUBLIC_API_BASE_URL` → `extra.apiUrl` → default).

### TLS in production

HTTPS is not terminated inside the Rust server. Put Nginx, Caddy, or another reverse proxy in front if you need TLS; point the frontend’s API URL at the HTTPS origin clients use.


