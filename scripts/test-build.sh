#!/bin/bash

echo "🔧 Checking build configuration..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm ci --no-audit --frozen-lockfile
fi

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf client/dist client/build packages/*/dist

# Build packages first
echo "📦 Building packages..."
npm run build:data-provider
npm run build:mcp  
npm run build:data-schemas

# Build frontend
echo "🏗️ Building frontend..."
cd client
NODE_OPTIONS="--max-old-space-size=3072" npm run build
cd ..

echo "✅ Build completed successfully!"
echo "🚀 Ready for deployment!"