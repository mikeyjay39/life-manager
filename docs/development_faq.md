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

## Local HTTPS (React Native and self-signed certs)

The backend serves HTTPS using the existing PEM files in `backend/certs/` (`cert.pem`, `key.pem`). Do not regenerate these for normal development.

The certificate is a self-signed root (`CN=localhost`, `CA:TRUE`) with no Subject Alternative Name entries. That means:

- Connections to `https://localhost:3000` (web, iOS Simulator) validate against `localhost`.
- **Android Emulator:** use `https://localhost:3000` in the app (same hostname as the cert) and run `adb reverse tcp:3000 tcp:3000` so the emulator’s `localhost:3000` forwards to your host machine. Do not use `https://10.0.2.2:3000` with this cert—the server name would not match `localhost`.
- **Physical devices** using a LAN IP (for example `https://192.168.1.10:3000`) will **not** match `CN=localhost` unless that name or IP is on the certificate. Use Expo tunnel, a simulator, or `extra.apiUrl` with a hostname that matches a future cert update.

### Trust the existing certificate on the device or simulator

You must install and trust `backend/certs/cert.pem` as a **CA** on each runtime. That lets the OS validate the server’s TLS without disabling TLS in the app.

**Android (emulator or device)**

1. Copy `backend/certs/cert.pem` to the device (for example `adb push backend/certs/cert.pem /sdcard/Download/life-manager-ca.pem`).
2. Open **Settings → Security → Encryption & credentials → Install a certificate → CA certificate**.
3. Pick the file and complete the install.
4. Retry the app against `https://localhost:3000` (or your configured `API_BASE_URL`).

**iOS (Simulator or device)**

1. Transfer `backend/certs/cert.pem` to the device (AirDrop, email, or host it briefly over HTTP for download in Simulator).
2. Open the file and install the profile (**Settings** will show a profile to install).
3. Open **Settings → General → About → Certificate Trust Settings** and enable **full trust** for this certificate.
4. Retry the app.

**Web browser (Brave, Chrome, Edge, and similar Chromium browsers)**

For the Expo **web** frontend, `fetch` from your app origin to `https://localhost:3000` will fail until the browser accepts the backend’s self-signed TLS. Do this once per browser profile:

1. **Import the self-signed certificate** (`backend/certs/cert.pem`) into the browser or your OS trust store, following your browser’s usual steps for importing a CA or site certificate.
2. Open **`https://localhost:3000/health`** in the browser (same host and port the frontend uses for the API).
3. When the browser warns about the connection, **proceed and explicitly trust this site** for `localhost` (wording varies; in Brave you confirm the exception for this origin).
4. Reload or run the React frontend again. API calls to the backend should work now that the browser has accepted TLS for that origin.

If you skip the visit to `/health` (or another path on `https://localhost:3000`) and never trust the certificate for that origin, the app console may show errors such as `net::ERR_CERT_*` or `Failed to fetch` even though the backend is running.

**Verify before testing in the app**

```bash
# Should succeed without -k after the CA is trusted on that machine:
curl -v --max-time 8 https://localhost:3000/api/v1/auth/protected
```

On the **web** client, trusting via the browser flow above is usually enough; `curl` is optional for checking from the terminal.

### Frontend base URL

Override the API URL in Expo config (`extra.apiUrl`) if needed so it matches a hostname the certificate validates and that the device can reach. See `frontend/constants/config.ts`.


