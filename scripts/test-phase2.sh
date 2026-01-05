#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3080}"
LOGIN_URL="$BASE_URL/api/auth/login"
FILES_URL="$BASE_URL/api/files"
CHAT_URL="$BASE_URL/api/ask/agents"
RAG_API_URL="${RAG_API_URL:-http://localhost:8000}"
FILE_PATH="Starbucks-Fiscal-2024-Global-Impact-Report.pdf"
USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6426.0 Safari/537.36"

if [ ! -f "$FILE_PATH" ]; then
  echo "ERROR: File $FILE_PATH not found"
  exit 1
fi

if ! command -v jq >/dev/null; then
  echo "ERROR: jq is required to run this script"
  exit 1
fi

print_heading() {
  printf "\n== %s ==\n" "$1"
}

print_success() {
  printf "✅ %s\n" "$1"
}

print_error() {
  printf "❌ %s\n" "$1" >&2
}

print_heading "Phase 2: RAG & Vector Storage Test"

# Login
print_heading "Login"
LOGIN_PAYLOAD='{ "email": "admin@librechat.local", "password": "AdminPass123!" }'
LOGIN_RESPONSE=$(curl -sS -X POST "$LOGIN_URL" \
  -H "User-Agent: $USER_AGENT" \
  -H 'Content-Type: application/json' \
  -d "$LOGIN_PAYLOAD")
TOKEN=$(printf '%s' "$LOGIN_RESPONSE" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  print_error "Failed to authenticate"
  printf '%s\n' "$LOGIN_RESPONSE" | jq -C '.'
  exit 1
fi
print_success "Obtained access token"

# Upload document with message_file=true to trigger vector storage
# Using endpoint=default will process through processFileUpload which handles text extraction
FILE_ID=$(uuidgen)
print_heading "Upload Document for RAG"
UPLOAD_RESPONSE=$(curl -sS -X POST "$FILES_URL" \
  -H "User-Agent: $USER_AGENT" \
  -H "Authorization: Bearer $TOKEN" \
  -F endpoint=default \
  -F endpointType=default \
  -F file_id="$FILE_ID" \
  -F message_file=true \
  -F file=@"$FILE_PATH")

print_success "File uploaded for RAG processing"

# Extract upload details
UPLOADED_FILE=$(printf '%s' "$UPLOAD_RESPONSE" | jq -c '.')
SERVER_FILE_ID=$(printf '%s' "$UPLOAD_RESPONSE" | jq -r '.file_id // empty')
FILE_TEXT=$(printf '%s' "$UPLOAD_RESPONSE" | jq -r '.text // empty')
EMBEDDED=$(printf '%s' "$UPLOAD_RESPONSE" | jq -r '.embedded // false')
CHUNK_COUNT=$(printf '%s' "$UPLOAD_RESPONSE" | jq -r '.metadata.chunk_count // 0')

print_heading "Upload Summary"
printf "Client File ID: %s\n" "$FILE_ID"
printf "Server File ID: %s\n" "$SERVER_FILE_ID"
printf "Embedded flag: %s\n" "$EMBEDDED"
printf "Chunk count: %s\n" "$CHUNK_COUNT"

if [ -n "$FILE_TEXT" ] && [ "$FILE_TEXT" != "null" ]; then
  TEXT_LENGTH=${#FILE_TEXT}
  excerpt=$(printf '%s' "$FILE_TEXT" | cut -c1-400)
  printf "Text extracted (%d chars): %s...\n" "$TEXT_LENGTH" "$excerpt"
  print_success "Text extraction successful"
else
  print_error "No text extracted from document"
fi

if [ "$EMBEDDED" = "true" ]; then
  print_success "Document embedded in vector database"
else
  print_error "Document not embedded in vector database"
fi

if [ "$CHUNK_COUNT" -gt 0 ]; then
  print_success "Document chunked into $CHUNK_COUNT chunks"
else
  print_error "Document not chunked"
fi

# Verify document can be queried via RAG API
print_heading "Query RAG API"
if [ "$EMBEDDED" = "true" ]; then
  # Query the RAG API to verify the document is searchable
  RAG_QUERY='{"query": "What are the main sustainability initiatives mentioned?", "file_ids": ["'$SERVER_FILE_ID'"]}'
  RAG_RESPONSE=$(curl -sS -X POST "$RAG_API_URL/query" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$RAG_QUERY" 2>&1 || echo '{"error": "RAG API not available"}')
  
  if echo "$RAG_RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
    print_error "RAG API query failed or not available"
    echo "$RAG_RESPONSE" | jq -C '.'
  else
    print_success "RAG API query successful"
    echo "$RAG_RESPONSE" | jq -C '.results[0:2]' 2>/dev/null || echo "$RAG_RESPONSE"
  fi
fi

# Test Ollama Mistral summarization
print_heading "Test Ollama Mistral Summarization"

# Check if Ollama is available
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
if curl -sS "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  print_success "Ollama is available"
  
  # Check if mistral model is available
  MODELS=$(curl -sS "$OLLAMA_URL/api/tags" | jq -r '.models[].name' 2>/dev/null || echo "")
  if echo "$MODELS" | grep -q "mistral"; then
    print_success "Mistral model is available"
    
    # Create a summary prompt using the extracted text
    if [ -n "$FILE_TEXT" ] && [ "$FILE_TEXT" != "null" ]; then
      TEXT_SAMPLE=$(printf '%s' "$FILE_TEXT" | cut -c1-3000)
      SUMMARY_PROMPT="Summarize the following document excerpt in 3-5 sentences:\n\n$TEXT_SAMPLE"
      
      OLLAMA_REQUEST=$(jq -n \
        --arg model "mistral" \
        --arg prompt "$SUMMARY_PROMPT" \
        '{model: $model, prompt: $prompt, stream: false}')
      
      print_heading "Generating Summary with Mistral"
      SUMMARY_RESPONSE=$(curl -sS -X POST "$OLLAMA_URL/api/generate" \
        -H 'Content-Type: application/json' \
        -d "$OLLAMA_REQUEST" 2>&1)
      
      if echo "$SUMMARY_RESPONSE" | jq -e '.response' >/dev/null 2>&1; then
        SUMMARY=$(echo "$SUMMARY_RESPONSE" | jq -r '.response')
        print_success "Summary generated successfully"
        printf "\n📝 Document Summary:\n%s\n\n" "$SUMMARY"
      else
        print_error "Failed to generate summary"
        echo "$SUMMARY_RESPONSE" | head -n 20
      fi
    else
      print_error "No text available for summarization"
    fi
  else
    print_error "Mistral model not available in Ollama"
    echo "Available models: $MODELS"
  fi
else
  print_error "Ollama is not available at $OLLAMA_URL"
fi

# Verify persistence in database
print_heading "Confirm Persistence"
FILES_LIST=$(curl -sS -H "User-Agent: $USER_AGENT" \
  -H "Authorization: Bearer $TOKEN" "$FILES_URL")
EXISTING=$(printf '%s' "$FILES_LIST" | jq -c "map(select(.temp_file_id==\"$FILE_ID\")) | .[0]")
if [ "$EXISTING" = "null" ] || [ -z "$EXISTING" ]; then
  print_error "Uploaded file not found in GET /api/files"
  exit 1
fi
print_success "File persisted in database"

# Display final report
print_heading "Phase 2 Test Summary"
printf "✅ Document uploaded: %s\n" "$FILE_PATH"
printf "✅ Text extracted: %d characters\n" "${TEXT_LENGTH:-0}"
printf "✅ Vector embedding: %s\n" "$EMBEDDED"
printf "✅ Chunks created: %s\n" "$CHUNK_COUNT"
printf "✅ File persisted: %s\n" "$SERVER_FILE_ID"

if [ "$EMBEDDED" = "true" ] && [ "$CHUNK_COUNT" -gt 0 ]; then
  print_success "Phase 2 test completed successfully"
  exit 0
else
  print_error "Phase 2 test completed with warnings"
  exit 1
fi
