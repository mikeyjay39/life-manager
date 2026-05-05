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

Root-level **`docker-compose.yml`** groups services under Compose **profiles** (`dev`, `prod`, `test`). **`start_app.sh`** (and **`backend/start_backend.sh`**) pass `--profile <profile>` and `--env-file backend/.<profile>.env` so variables like **`APP_PORT`** and **`TESSERACT_PORT`** apply consistently.

| Profile | Compose services | Typical host ports (see env / Compose defaults) |
|---------|------------------|--------------------------------------------------|
| **prod** | `life-manager`, `frontend`, `gateway`, `tesseract` | **`NGINX_PORT`** → **`gateway`** (default **80**); **`APP_PORT`** → API container (default **3000**); **`FRONTEND_PORT`** → static frontend container (default **8080**); **`TESSERACT_PORT`** → Tesseract |
| **dev** | `frontend_dev`, `tesseract` | **`FRONTEND_DEV_PORT`** → **`frontend_dev`** (default **8081**); **`TESSERACT_PORT`**; backend on host **`APP_PORT`** (**3000**) via **`cargo run`** |
| **test** | `tesseract` only | **`TESSERACT_PORT`** |

Orchestration summary: see **[`README.md`](../README.md)** (`start_app.sh`, containers vs host processes, and **prod** gateway entry).

## Local HTTP (API URL)

The backend listens on plain HTTP (see **`APP_PORT`**, default **`3000`**). For **dev**, local Expo on the host usually talks to **`http://localhost:3000`**. For **prod**, browsers should use the **`gateway`** origin (default **`http://localhost`** if **`NGINX_PORT`** is **80**) — set **`EXPO_PUBLIC_API_BASE_URL`** to that same origin when building the prod frontend, or `http://localhost:<NGINX_PORT>` if you changed **`NGINX_PORT`**. Override with **`EXPO_PUBLIC_API_BASE_URL`** or Expo **`extra.apiUrl`** whenever the API is on another host or port.

- **Android Emulator:** run `adb reverse tcp:3000 tcp:3000` so the emulator’s `localhost:3000` reaches your machine. Use `http://localhost:3000` for the API URL when reversed.
- **Physical devices** on the LAN should set `extra.apiUrl` / env to an origin the device can reach (for example `http://192.168.1.10:3000`).

**Quick check**

```bash
curl -v --max-time 8 http://localhost:3000/api/health
```

### Frontend base URL

See `frontend/constants/config.ts` for resolution order (`EXPO_PUBLIC_API_BASE_URL` → `extra.apiUrl` → default).

### TLS in production

HTTPS is not terminated inside the Rust server. Put Nginx, Caddy, or another reverse proxy in front if you need TLS; point the frontend’s API URL at the HTTPS origin clients use.


