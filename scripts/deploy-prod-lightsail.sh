#!/usr/bin/env bash
# Deploy the prod Docker Compose stack on Lightsail after CI pushes images to ECR.
# Invoked by GitHub Actions over SSH or manually on the instance.
set -euo pipefail

: "${ECR_PASSWORD:?ECR_PASSWORD is required}"
: "${ECR_REGISTRY:?ECR_REGISTRY is required}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-backend/.prod.env}"
COMPOSE_PROFILE="${COMPOSE_PROFILE:-prod}"

echo "${ECR_PASSWORD}" | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

cd "${DEPLOY_PATH}"

echo "Deploying prod stack (:latest images) for commit ${GITHUB_SHA}"

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --profile "${COMPOSE_PROFILE}" pull
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --profile "${COMPOSE_PROFILE}" up -d
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --profile "${COMPOSE_PROFILE}" ps
