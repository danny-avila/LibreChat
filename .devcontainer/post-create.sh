#!/bin/bash
set -e

echo "🚀 post-create: install & build"

if [ ! -f "/workspaces/.env" ] && [ -f "/workspaces/.devcontainer/env.template" ]; then
  cp /workspaces/.devcontainer/env.template /workspaces/.env
  echo "✓ .env created from template"
fi

cd /workspaces

echo "📦 npm install"
npm install

echo "🔨 build packages"
npm run build:data-provider || true
npm run build:data-schemas || true
npm run build:api || true

echo "🎭 playwright deps (optional)"
npx playwright install --with-deps || true

echo "✅ post-create done"

