#!/bin/sh
set -e

CERT=/etc/nginx/certs/localhost.crt
KEY=/etc/nginx/certs/localhost.key

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
  exit 0
fi

echo "gateway: missing TLS files under /etc/nginx/certs; generating self-signed localhost certificate..."
mkdir -p /etc/nginx/certs
openssl req -x509 -newkey rsa:4096 \
  -keyout "$KEY" \
  -out "$CERT" \
  -days 365 -nodes \
  -subj "/CN=localhost"
