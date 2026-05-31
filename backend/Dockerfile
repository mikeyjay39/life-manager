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
