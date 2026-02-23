#! /usr/bin/sh

backend/start_backend.sh dev &
frontend/start_frontend.sh &
