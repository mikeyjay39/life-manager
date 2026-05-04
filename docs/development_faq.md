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

## Local HTTP (API URL)

The backend listens on plain HTTP (see `APP_PORT`, default `3000`). The frontend default API base URL is `http://localhost:3000`; override with `EXPO_PUBLIC_API_BASE_URL` or Expo `extra.apiUrl` when the API is on another host or port.

- **Android Emulator:** run `adb reverse tcp:3000 tcp:3000` so the emulator’s `localhost:3000` reaches your machine. Use `http://localhost:3000` for the API URL when reversed.
- **Physical devices** on the LAN should set `extra.apiUrl` / env to an origin the device can reach (for example `http://192.168.1.10:3000`).

**Quick check**

```bash
curl -v --max-time 8 http://localhost:3000/health
```

### Frontend base URL

See `frontend/constants/config.ts` for resolution order (`EXPO_PUBLIC_API_BASE_URL` → `extra.apiUrl` → default).

### TLS in production

HTTPS is not terminated inside the Rust server. Put Nginx, Caddy, or another reverse proxy in front if you need TLS; point the frontend’s API URL at the HTTPS origin clients use.


