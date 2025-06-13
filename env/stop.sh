#!/usr/bin/env bash

docker-compose down -v

rm -rf besu/qbft/nodes/node_1/database
rm -rf besu/qbft/nodes/node_1/caches
rm -rf besu/qbft/nodes/node_1/uploads
rm -rf besu/qbft/nodes/node_1/besu.networks
rm -rf besu/qbft/nodes/node_1/besu.ports
