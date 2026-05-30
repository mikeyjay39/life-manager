# ---- Build stage ----
FROM rust:bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY auth/Cargo.toml auth/
COPY life-manager/Cargo.toml life-manager/
RUN mkdir -p auth/src && echo "pub fn _dummy() {}" > auth/src/lib.rs \
 && mkdir -p life-manager/src && echo "pub fn _dummy() {}" > life-manager/src/lib.rs \
 && mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release

COPY . .
RUN chmod +x scripts/write_rev.sh \
 && ./scripts/write_rev.sh
RUN cargo build --release

# ---- Runtime stage ----
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates gosu libssl3 libpq5 \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --shell /usr/sbin/nologin appuser

WORKDIR /app

COPY --from=builder /app/target/release/life-manager /app/life-manager
COPY --from=builder /app/rev.txt /app/rev.txt

RUN chmod +x /app/life-manager \
 && chown appuser:appuser /app/life-manager /app/rev.txt

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV RUST_LOG=debug
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["/app/life-manager"]
