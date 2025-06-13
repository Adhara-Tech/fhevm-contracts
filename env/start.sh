#!/usr/bin/env bash

docker compose up -d
docker compose logs --tail=0 --follow