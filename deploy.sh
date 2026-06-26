#!/bin/bash
set -e

echo "==> Pulling latest code..."
git pull origin main

echo "==> Building Docker image..."
docker compose build --no-cache

echo "==> Restarting services..."
docker compose down
docker compose up -d

echo "==> Removing dangling images..."
docker image prune -f

echo ""
echo "==> Done! Running containers:"
docker compose ps
