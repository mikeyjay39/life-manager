# TLS (HTTPS) in front of the backend

The Axum backend listens for **plain HTTP** only. It does not load certificates or terminate TLS in-process.

For HTTPS you typically:

1. Run a **reverse proxy** (Nginx, Caddy, Traefik, a cloud load balancer, etc.) that holds the TLS certificate and key.
2. Proxy to the backend over HTTP on your internal network (for example `http://127.0.0.1:${APP_PORT}`).
3. Configure the frontend `EXPO_PUBLIC_API_BASE_URL` / `extra.apiUrl` to the **public HTTPS origin** clients use.

## Example: self-signed cert for local experiments (proxy side only)

Generate PEM files for the proxy (not for Axum):

```sh
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

Point your reverse proxy at those files and forward to `http://localhost:3000` (or whatever `APP_PORT` is).

## Troubleshooting

- If the browser shows certificate errors, fix trust/config on the **proxy**, not in this repo’s Rust binary.
- If API calls fail from the app, ensure `EXPO_PUBLIC_API_BASE_URL` matches the scheme and host the client actually uses (HTTPS after the proxy, HTTP only for direct local development).
