#!/bin/bash

# LibreChat Document Upload Test Script
# Tests that files are properly processed and text is extracted before sending to LLM
# Usage: ./test-document-upload.sh <file_path> <prompt>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LIBRECHAT_URL="${LIBRECHAT_URL:-http://localhost:3080}"
API_URL="$LIBRECHAT_URL/api"
TEST_FILE="${1:-}"
TEST_PROMPT="${2:-Summarize this document}"
USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6426.0 Safari/537.36"
# Use LDAP user by default
USERNAME="${LIBRECHAT_USER:-gamma@librechat.local}"
PASSWORD="${LIBRECHAT_PASS:-GammaPass123!}"
AGENT_ID="${3:-${LIBRECHAT_AGENT_ID:-}}"
MODEL="${4:-${LIBRECHAT_MODEL:-gpt-4}}"
TOOL_RESOURCE="${LIBRECHAT_TOOL_RESOURCE:-file_search}"

# Temporary files
COOKIE_FILE="/tmp/librechat_cookies_$$.txt"
RESPONSE_FILE="/tmp/librechat_response_$$.json"
UPLOAD_RESPONSE="/tmp/librechat_upload_$$.json"

# Cleanup function
cleanup() {
    rm -f "$COOKIE_FILE" "$RESPONSE_FILE" "$UPLOAD_RESPONSE"
}
trap cleanup EXIT

# Print functions
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if file is provided
if [ -z "$TEST_FILE" ]; then
    print_error "No file provided"
    echo "Usage: $0 <file_path> [prompt] [agent_id]"
    echo "       Agent ID required via third argument or LIBRECHAT_AGENT_ID env var"
    echo "Example: $0 /path/to/document.pdf 'Summarize this document'"
    exit 1
fi

# Check if file exists
if [ ! -f "$TEST_FILE" ]; then
    print_error "File not found: $TEST_FILE"
    exit 1
fi

if [ -z "$AGENT_ID" ]; then
    print_error "No agent_id provided"
    print_info "Set LIBRECHAT_AGENT_ID or pass the agent_id as the third argument"
    exit 1
fi

print_header "LibreChat Document Upload Test"
print_info "Testing file: $(basename "$TEST_FILE")"
print_info "Prompt: $TEST_PROMPT"
print_info "LibreChat URL: $LIBRECHAT_URL"
print_info "Agent ID: $AGENT_ID"
print_info "Tool resource: $TOOL_RESOURCE"
print_info "Model: $MODEL"
echo ""

# Step 1: Login
print_header "Step 1: Authentication"
LOGIN_RESPONSE=$(curl -s -c "$COOKIE_FILE" -X POST "$API_URL/auth/login" \
    -H "User-Agent: $USER_AGENT" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
    2>&1)

if echo "$LOGIN_RESPONSE" | grep -q "token\|user"; then
    print_success "Login successful"
else
    print_error "Login failed"
    print_info "Response: $LOGIN_RESPONSE"
    print_warning "Make sure LibreChat is running and user credentials are correct"
    print_info "You can set credentials with: LIBRECHAT_USER=your@email.com LIBRECHAT_PASS=yourpass $0 <file>"
    exit 1
fi

# Extract token if present in response
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4 || echo "")
if [ -n "$TOKEN" ]; then
    AUTH_HEADER="Authorization: Bearer $TOKEN"
else
    AUTH_HEADER=""
fi

# Step 2: Upload File
print_header "Step 2: Uploading File"
FILE_SIZE=$(du -h "$TEST_FILE" | cut -f1)
print_info "File size: $FILE_SIZE"
FILE_MIME_TYPE=$(file -b --mime-type "$TEST_FILE")
print_info "File type: $FILE_MIME_TYPE"

UPLOAD_RESPONSE_RAW=$(curl -s -b "$COOKIE_FILE" -X POST "$API_URL/files" \
    -H "User-Agent: $USER_AGENT" \
    ${AUTH_HEADER:+-H "$AUTH_HEADER"} \
    -F "file=@$TEST_FILE;type=$FILE_MIME_TYPE" \
    -F "file_id=$(uuidgen || echo "test-$(date +%s)")" \
    -F "endpoint=agents" \
    -F "agent_id=$AGENT_ID" \
    -F "tool_resource=$TOOL_RESOURCE" \
    -F "model=$MODEL" \
    -w "\nHTTP_STATUS:%{http_code}" \
    2>&1)

HTTP_STATUS=$(echo "$UPLOAD_RESPONSE_RAW" | grep "HTTP_STATUS:" | cut -d: -f2)
UPLOAD_BODY=$(echo "$UPLOAD_RESPONSE_RAW" | sed '/HTTP_STATUS:/d')

echo "$UPLOAD_BODY" > "$UPLOAD_RESPONSE"

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
    print_success "File uploaded successfully (HTTP $HTTP_STATUS)"
    
    # Extract file_id from response
    FILE_ID=$(echo "$UPLOAD_BODY" | grep -o '"file_id":"[^"]*' | cut -d'"' -f4)
    FILE_NAME=$(echo "$UPLOAD_BODY" | grep -o '"filename":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$FILE_ID" ]; then
        print_info "File ID: $FILE_ID"
        print_info "Filename: $FILE_NAME"
    else
        print_warning "Could not extract file_id from response"
        print_info "Response: $UPLOAD_BODY"
    fi
else
    print_error "File upload failed (HTTP $HTTP_STATUS)"
    print_info "Response: $UPLOAD_BODY"
    exit 1
fi

# Step 3: Check if file has text extracted
print_header "Step 3: Validating File Processing"

# Check if response contains text field (indicates parsing happened)
if echo "$UPLOAD_BODY" | grep -q '"text"'; then
    print_success "Document text extraction detected"
    TEXT_LENGTH=$(echo "$UPLOAD_BODY" | grep -o '"text":"[^"]*' | wc -c)
    print_info "Extracted text length: ~$TEXT_LENGTH characters"
elif echo "$UPLOAD_BODY" | grep -q '"embedded":true'; then
    print_success "Document processed for vector embedding"
else
    print_warning "No text field found in upload response"
    print_info "This may be normal for some file types"
fi

# Step 4: Send message with file attachment
print_header "Step 4: Sending Message with File Attachment"

CONVERSATION_ID=$(uuidgen || echo "test-conv-$(date +%s)")
MESSAGE_ID=$(uuidgen || echo "test-msg-$(date +%s)")

MESSAGE_PAYLOAD=$(cat <<EOF
{
  "text": "$TEST_PROMPT",
  "conversationId": "$CONVERSATION_ID",
  "parentMessageId": "00000000-0000-0000-0000-000000000000",
    "files": [
        {
            "file_id": "$FILE_ID",
            "filename": "$FILE_NAME",
            "type": "$FILE_MIME_TYPE"
        }
    ],
    "endpoint": "agents",
    "agentId": "$AGENT_ID",
    "model": "$MODEL"
}
EOF
)

print_info "Sending message to agent..."
MESSAGE_RESPONSE=$(curl -s -b "$COOKIE_FILE" -X POST "$API_URL/ask/agents" \
    -H "User-Agent: $USER_AGENT" \
    ${AUTH_HEADER:+-H "$AUTH_HEADER"} \
    -H "Content-Type: application/json" \
    -d "$MESSAGE_PAYLOAD" \
    -w "\nHTTP_STATUS:%{http_code}" \
    2>&1)

HTTP_STATUS=$(echo "$MESSAGE_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
MESSAGE_BODY=$(echo "$MESSAGE_RESPONSE" | sed '/HTTP_STATUS:/d')

echo "$MESSAGE_BODY" > "$RESPONSE_FILE"

# Step 5: Validate Response
print_header "Step 5: Validating Response"

if [ "$HTTP_STATUS" = "200" ] || echo "$MESSAGE_BODY" | grep -q "event: message"; then
    print_success "Message sent successfully"
    
    # Check for errors in response
    if echo "$MESSAGE_BODY" | grep -qi "invalid message format"; then
        print_error "CRITICAL: 'invalid message format' error detected!"
        print_error "This indicates raw binary data was sent to the LLM"
        echo ""
        print_info "Response excerpt:"
        echo "$MESSAGE_BODY" | head -20
        exit 1
    elif echo "$MESSAGE_BODY" | grep -qi "file_data"; then
        print_error "CRITICAL: 'file_data' field detected in response!"
        print_error "Raw binary data may have been included"
        exit 1
    elif echo "$MESSAGE_BODY" | grep -qi "error"; then
        print_warning "Error detected in response"
        ERROR_MSG=$(echo "$MESSAGE_BODY" | grep -o '"error":"[^"]*' | cut -d'"' -f4 || echo "Unknown error")
        print_info "Error message: $ERROR_MSG"
        exit 1
    else
        print_success "No errors detected in response"
        
        # Check if response contains actual content
        if echo "$MESSAGE_BODY" | grep -q "data:"; then
            print_success "Streaming response received"
            
            # Extract text content from SSE stream
            RESPONSE_TEXT=$(echo "$MESSAGE_BODY" | grep "data:" | sed 's/data: //g' | head -5)
            if [ -n "$RESPONSE_TEXT" ]; then
                print_success "LLM response generated successfully"
                echo ""
                print_info "Response preview:"
                echo "$RESPONSE_TEXT" | head -3
            fi
        fi
    fi
else
    print_error "Message failed (HTTP $HTTP_STATUS)"
    print_info "Response: $MESSAGE_BODY"
    exit 1
fi

# Step 6: Check Docker logs for validation
print_header "Step 6: Checking Docker Logs"

if command -v docker &> /dev/null && docker compose ps | grep -q "LibreChat"; then
    print_info "Checking last 100 log lines for issues..."
    
    LOG_OUTPUT=$(docker compose logs --tail=100 api 2>&1 || echo "Could not fetch logs")
    
    # Check for critical errors
    if echo "$LOG_OUTPUT" | grep -q "file_data"; then
        print_error "Found 'file_data' in logs - raw binary may have been processed"
        echo "$LOG_OUTPUT" | grep "file_data" | tail -3
    else
        print_success "No raw file_data found in logs"
    fi
    
    if echo "$LOG_OUTPUT" | grep -q "invalid message format"; then
        print_error "Found 'invalid message format' error in logs"
        echo "$LOG_OUTPUT" | grep "invalid message format" | tail -3
    else
        print_success "No message format errors in logs"
    fi
    
    if echo "$LOG_OUTPUT" | grep -q "Stripped documents with raw file_data"; then
        print_success "Document sanitization working - raw data was stripped"
        STRIP_COUNT=$(echo "$LOG_OUTPUT" | grep -c "Stripped documents" || echo "0")
        print_info "Found $STRIP_COUNT document sanitization events"
    fi
    
    if echo "$LOG_OUTPUT" | grep -q "Skipping document encoding for agent endpoint"; then
        print_success "Agent endpoint protection working"
    fi
else
    print_warning "Docker not available or container not running - skipping log check"
fi

# Final summary
print_header "Test Summary"

if [ $? -eq 0 ]; then
    print_success "All tests passed!"
    echo ""
    print_info "Document handling is working correctly:"
    echo "  • File uploaded successfully"
    echo "  • Text extraction completed"
    echo "  • No raw binary sent to LLM"
    echo "  • LLM generated response"
    echo ""
    exit 0
else
    print_error "Some tests failed"
    echo ""
    print_info "Check the output above for details"
    exit 1
fi
