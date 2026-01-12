#! /usr/bin/bash

if [ "$#" -lt 1 ]; then
  echo "Usage: start_backend.sh <test | dev | prod>"
  exit 1
fi

PROFILE="$1"

docker stop $(docker ps -aq) > /dev/null 2>&1
docker rm $(docker ps -aq) > /dev/null 2>&1

cd "$(dirname "$0")"

cargo build
# docker compose --profile $PROFILE --env-file .${PROFILE}.env up
docker compose --profile prod --env-file .prod.env up

cd -
