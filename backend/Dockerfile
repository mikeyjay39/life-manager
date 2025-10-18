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

# Use an environment variable for the port instead of hardcoding
ENV RUST_LOG=debug
ENV PORT=${PORT}

# Document that the app listens on $PORT (defaults can still be handled by docker-compose)
EXPOSE ${PORT}

CMD ["/app/life-manager"]
