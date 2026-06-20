#!/usr/bin/env bash
# Install or verify the Grafana Loki Docker logging driver plugin.
# Sourced by backend/start_backend.sh and scripts/deploy-prod-lightsail.sh.
loki_docker_plugin_setup() {
  if docker plugin ls | grep -q "loki.*Loki Logging Driver"; then
    echo "Loki plugin is installed."
    if docker plugin ls | grep "loki" | grep -q "true"; then
      echo "Loki plugin is enabled."
    else
      echo "Loki plugin is installed but DISABLED."
    fi
  else
    echo "Loki plugin is NOT installed, installing now..."
    docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
  fi
}
