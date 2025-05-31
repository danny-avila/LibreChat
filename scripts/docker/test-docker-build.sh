#!/bin/bash

echo "Testing Docker build with fixed Dockerfile..."
echo "============================================"

# Test with the fixed single-stage Dockerfile
echo -e "\n1. Testing single-stage Dockerfile (Dockerfile.fixed):"
docker build -f Dockerfile.fixed -t librechat-test:single-stage .

# Check if the build succeeded
if [ $? -eq 0 ]; then
    echo "✅ Single-stage build succeeded!"
else
    echo "❌ Single-stage build failed!"
fi

echo -e "\n2. Testing multi-stage Dockerfile (Dockerfile.multi.fixed):"
docker build -f Dockerfile.multi.fixed -t librechat-test:multi-stage .

# Check if the build succeeded
if [ $? -eq 0 ]; then
    echo "✅ Multi-stage build succeeded!"
else
    echo "❌ Multi-stage build failed!"
fi

echo -e "\nBuild test complete!" 