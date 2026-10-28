#!/bin/bash
set -e
cd ~/Завантажене/project

echo "📦 Коміт локальних змін..."
git add .
git commit -m "${1:-update}" || true
git push || true

SERVER_IP="100.125.134.35"
if ! ssh -o BatchMode=yes -o ConnectTimeout=3 root@$SERVER_IP "true" 2>/dev/null; then
  echo "⚠️ VPN IP $SERVER_IP недоступний, пробуємо публічний IP 144.91.126.182..."
  SERVER_IP="144.91.126.182"
fi

echo "🚀 Синхронізація файлів на сервер ($SERVER_IP)..."
rsync -avz --exclude '.git' --exclude 'node_modules' --exclude '.next' ~/Завантажене/project/ root@$SERVER_IP:/opt/roadsync/

echo "🔨 Збірка та перезапуск Docker на сервері..."
ssh root@$SERVER_IP "cd /opt/roadsync && docker compose build && docker compose up -d"

echo "✅ Deploy завершено!"
