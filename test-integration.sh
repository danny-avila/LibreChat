#!/bin/bash

# LibreChat + N8N Integration Test Script
echo "🚀 Testing LibreChat + N8N Integration..."
echo ""

# Test 1: Check LibreChat is responding
echo "📋 Test 1: LibreChat Health Check"
curl -s http://localhost:3080/api/health > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ LibreChat is running on port 3080"
else
    echo "❌ LibreChat is not responding"
fi

# Test 2: Check N8N is responding
echo ""
echo "📋 Test 2: N8N Health Check"
curl -s http://localhost:5678/healthz > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ N8N is running on port 5678"
else
    echo "❌ N8N is not responding"
fi

# Test 3: Test webhook endpoint (if workflow is active)
echo ""
echo "📋 Test 3: Testing N8N Webhook"
echo "Note: Import the workflow first and activate it in N8N UI"
curl -X POST http://localhost:5678/webhook/librechat-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "new_conversation",
    "user": "test-user",
    "message": "Hello from test script!",
    "model": "gpt-3.5-turbo",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
  }' \
  -s -o /dev/null -w "HTTP Status: %{http_code}\n"

echo ""
echo "🎯 Integration test complete!"
echo ""
echo "Next steps:"
echo "1. Open N8N at http://localhost:5678"
echo "2. Import the workflow from n8n-workflows/complete-workflow.json"
echo "3. Activate the workflow"
echo "4. Test with real LibreChat conversations"