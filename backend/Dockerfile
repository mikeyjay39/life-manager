# ---- Build stage ----
FROM rust:bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release

COPY . .
RUN cargo build --release

# ---- Runtime stage ----
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 libpq5 \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --shell /usr/sbin/nologin appuser

WORKDIR /app

COPY --from=builder /app/target/release/life-manager /app/life-manager
COPY certs/ /app/certs/

RUN chmod +x /app/life-manager \
 && chown appuser:appuser /app/life-manager \
 && chown -R appuser:appuser /app/certs \
 && chmod 600 /app/certs/key.pem \
 && chmod 644 /app/certs/cert.pem

USER appuser

ENV RUST_LOG=debug
ENV PORT=3000
EXPOSE 3000

CMD ["/app/life-manager"]
