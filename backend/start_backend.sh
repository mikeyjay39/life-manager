#! /usr/bin/bash

docker stop $(docker ps -aq) > /dev/null 2>&1
docker rm $(docker ps -aq) > /dev/null 2>&1

cd "$(dirname "$0")"

cargo build
docker compose --profile prod --env-file .prod.env up

cd -
