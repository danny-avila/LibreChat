@echo off
echo 🚀 Testing LibreChat + N8N Integration...
echo.

:: Test 1: Check LibreChat is responding
echo 📋 Test 1: LibreChat Health Check
curl -s http://localhost:3080 > nul 2>&1
if %errorlevel%==0 (
    echo ✅ LibreChat is running on port 3080
) else (
    echo ❌ LibreChat is not responding
)

:: Test 2: Check N8N is responding  
echo.
echo 📋 Test 2: N8N Health Check
curl -s http://localhost:5678 > nul 2>&1
if %errorlevel%==0 (
    echo ✅ N8N is running on port 5678
) else (
    echo ❌ N8N is not responding
)

:: Test 3: Test webhook endpoint
echo.
echo 📋 Test 3: Testing N8N Webhook
echo Note: Import the workflow first and activate it in N8N UI
curl -X POST http://localhost:5678/webhook/librechat-webhook ^
  -H "Content-Type: application/json" ^
  -d "{\"action\":\"new_conversation\",\"user\":\"test-user\",\"message\":\"Hello from test script!\",\"model\":\"gpt-3.5-turbo\",\"timestamp\":\"%date% %time%\"}" ^
  -s -w "HTTP Status: %%{http_code}\n"

echo.
echo 🎯 Integration test complete!
echo.
echo Next steps:
echo 1. Open N8N at http://localhost:5678
echo 2. Import the workflow from n8n-workflows/complete-workflow.json
echo 3. Activate the workflow
echo 4. Test with real LibreChat conversations
pause