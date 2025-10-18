#! /bin/bash

docker stop $(docker ps -aq)
docker rm $(docker ps -aq)
docker-compose up &
sleep 5
diesel migration run
cargo build
