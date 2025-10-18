#! /usr/bin/bash

docker stop $(docker ps -aq) > /dev/null 2>&1
docker rm $(docker ps -aq) > /dev/null 2>&1

cd "$(dirname "$0")"

cargo build
docker-compose up --build &

cd -
