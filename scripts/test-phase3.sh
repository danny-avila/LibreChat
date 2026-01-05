#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3080}"
LOGIN_URL="$BASE_URL/api/auth/login"
FILES_URL="$BASE_URL/api/files"
RAG_API_URL="${RAG_API_URL:-http://localhost:8000}"
FILE_PATH="Starbucks-Fiscal-2024-Global-Impact-Report.pdf"
USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6426.0 Safari/537.36"

require_bin() {
  if ! command -v "$1" >/dev/null; then
    echo "ERROR: $1 is required to run this script" >&2
    exit 1
  fi
}

print_heading() { printf "\n== %s ==\n" "$1"; }
print_success() { printf "✅ %s\n" "$1"; }
print_error() { printf "❌ %s\n" "$1" >&2; }

require_bin "jq"
require_bin "uuidgen"

if [ ! -f "$FILE_PATH" ]; then
  echo "ERROR: File $FILE_PATH not found" >&2
  exit 1
fi

print_heading "Phase 3: Vector Query Validation"

print_heading "Login"
LOGIN_RESPONSE=$(curl -sS -X POST "$LOGIN_URL" \
  -H "User-Agent: $USER_AGENT" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@librechat.local","password":"AdminPass123!"}')
TOKEN=$(printf '%s' "$LOGIN_RESPONSE" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  print_error "Failed to authenticate"
  printf '%s\n' "$LOGIN_RESPONSE" | jq -C '.'
  exit 1
fi
print_success "Authenticated"

print_heading "Upload Document"
FILE_ID=$(uuidgen)
UPLOAD_RESPONSE=$(curl -sS -X POST "$FILES_URL" \
  -H "User-Agent: $USER_AGENT" \
  -H "Authorization: Bearer $TOKEN" \
  -F endpoint=default \
  -F endpointType=default \
  -F file_id="$FILE_ID" \
  -F message_file=true \
  -F file=@"$FILE_PATH")
print_success "Upload request submitted"

SERVER_FILE_ID=$(printf '%s' "$UPLOAD_RESPONSE" | jq -r '.file_id // empty')
EMBEDDED=$(printf '%s' "$UPLOAD_RESPONSE" | jq -r '.embedded // false')
CHUNK_COUNT=$(printf '%s' "$UPLOAD_RESPONSE" | jq -r '.metadata.chunk_count // 0')

print_heading "Embed Status"
echo "Server file id: $SERVER_FILE_ID"
echo "Embedded flag: $EMBEDDED"
echo "Chunk count: $CHUNK_COUNT"

if [ "$EMBEDDED" != "true" ]; then
  print_error "Document was not flagged as embedded"
  exit 1
fi

if [ "$CHUNK_COUNT" -le 0 ]; then
  print_error "Document chunks not registered"
  exit 1
fi

print_success "Document embedded and chunked"

print_heading "Query RAG API"
if [ -z "$SERVER_FILE_ID" ]; then
  print_error "Missing file_id, cannot query RAG API"
  exit 1
fi

RAG_QUERY=$(jq -n \
  --arg file_id "$SERVER_FILE_ID" \
  --arg query "Summarize the sustainability highlights" \
  '{query: $query, file_ids: [$file_id]}')
RAG_RESPONSE=$(curl -sS -X POST "$RAG_API_URL/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$RAG_QUERY")

if echo "$RAG_RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
  print_error "RAG API returned an error"
  printf '%s\n' "$RAG_RESPONSE" | jq -C '.'
  exit 1
fi

RESULT_COUNT=$(printf '%s' "$RAG_RESPONSE" | jq '.results | length // 0')
if [ "$RESULT_COUNT" -eq 0 ]; then
  print_error "RAG API did not return any results"
  printf '%s\n' "$RAG_RESPONSE" | jq -C '.'
  exit 1
fi

print_success "RAG API returned $RESULT_COUNT result(s)"
printf '%s\n' "$RAG_RESPONSE" | jq -C '.results[0]'

print_heading "Phase 3 Validation Complete"
print_success "Document query pipeline is operational"