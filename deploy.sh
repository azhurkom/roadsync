#!/bin/bash
cd ~/Завантажене/project
git add .
git commit -m "${1:-update}"
git push
ssh root@144.91.126.182 "cd /opt/roadsync && git pull && docker compose build --no-cache && docker compose up -d"
echo "✅ Deploy завершено!"
