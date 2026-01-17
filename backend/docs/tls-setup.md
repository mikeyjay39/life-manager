# TLS Setup for Axum Backend

This document describes how to enable TLS termination in your Axum backend using tokio-rustls.

## Prerequisites
- Ensure you have SSL certificate and key files, e.g., `cert.pem` and `key.pem` (can be self-signed for development or from a trusted authority for production).

## Configuration
- Set the following environment variables before starting your server:
  - `TLS_CERT_PATH=/absolute/or/relative/path/to/cert.pem`
  - `TLS_KEY_PATH=/absolute/or/relative/path/to/key.pem`

Example for unix shell:
```sh
export TLS_CERT_PATH=cert.pem
export TLS_KEY_PATH=key.pem
```

## Running the Server
- Start the backend as usual. If the cert/key files and environment variables are correctly set, the server will accept HTTPS connections on the configured address.

## Notes
- For production, obtain your certificate from a trusted Certificate Authority (CA).
- For local testing, you can generate a self-signed certificate using OpenSSL:

```sh
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

Place these files securely and set the `TLS_CERT_PATH` and `TLS_KEY_PATH` accordingly.

## Troubleshooting
- If the server fails to start, check that the cert/key files exist, the paths are correct, and the files have the correct permissions.

