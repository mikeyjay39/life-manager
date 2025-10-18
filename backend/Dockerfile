FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 libpq5 \
 && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --system --create-home --shell /usr/sbin/nologin appuser

WORKDIR /app

# Copy your existing binary into the container
COPY target/debug/life-manager /app/life-manager

# Ensure it’s executable and owned by appuser
RUN chmod +x /app/life-manager && chown appuser:appuser /app/life-manager

USER appuser

EXPOSE 3000
ENV RUST_LOG=info
ENV PORT=3000

CMD ["/app/life-manager"]
