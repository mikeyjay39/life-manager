# ---- Development: cargo run (profile docker-dev) ----
FROM rust:bookworm AS development
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 pkg-config \
 && rm -rf /var/lib/apt/lists/*
# Bake workspace into the image. Full-tree bind mounts are not used at runtime
# because they break when Docker resolves paths outside the real project checkout
# (e.g. dev-container home volume). Rebuild with --build-image after code changes.
COPY . .
COPY docker-dev-entrypoint.sh /docker-dev-entrypoint.sh
RUN chmod +x /docker-dev-entrypoint.sh
ENV RUST_LOG=debug
EXPOSE 3000
ENTRYPOINT ["/docker-dev-entrypoint.sh"]
CMD ["cargo", "run"]

# ---- Build stage ----
FROM rust:bookworm AS builder
WORKDIR /app

# Single copy: workspace path crates (libs/*) must not be built from stub sources
# and then linked by mikeyjay-server — that pattern breaks after COPY (stale rlibs).
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
