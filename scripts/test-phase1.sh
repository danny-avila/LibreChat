#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3080}"
LOGIN_URL="$BASE_URL/api/auth/login"
FILES_URL="$BASE_URL/api/files"
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

FILE_ID=$(uuidgen)
print_heading "Upload Document"
UPLOAD_RESPONSE=$(curl -fsS -X POST "$FILES_URL" \
  -H "User-Agent: $USER_AGENT" \
  -H "Authorization: Bearer $TOKEN" \
  -F endpoint=default \
  -F endpointType=default \
  -F file_id="$FILE_ID" \
  -F message_file=true \
  -F file=@"$FILE_PATH")
print_success "File uploaded"
UPLOADED_FILE=$(printf '%s' "$UPLOAD_RESPONSE" | jq -c '.')
FILE_TEXT=$(printf '%s' "$UPLOAD_RESPONSE" | jq -r '.text // empty')
EMBEDDED=$(printf '%s' "$UPLOAD_RESPONSE" | jq -r '.embedded // false')
print_heading "Upload Summary"
printf "File ID: %s\n" "$FILE_ID"
if [ -n "$FILE_TEXT" ]; then
  TEXT_LENGTH=${#FILE_TEXT}
  excerpt=$(printf '%s' "$FILE_TEXT" | cut -c1-400)
  printf "Text extracted (%d chars): %s...\n" "$TEXT_LENGTH" "$excerpt"
else
  echo "Text extraction not returned in response"
fi
printf "Embedded flag: %s\n" "$EMBEDDED"

print_heading "Confirm Persistence"
FILES_LIST=$(curl -fsS -H "User-Agent: $USER_AGENT" \
  -H "Authorization: Bearer $TOKEN" "$FILES_URL")
EXISTING=$(printf '%s' "$FILES_LIST" | jq -c "map(select(.temp_file_id==\"$FILE_ID\")) | .[0]")
if [ "$EXISTING" = "null" ] || [ -z "$EXISTING" ]; then
  print_error "Uploaded file not found in GET /api/files"
  exit 1
fi
print_success "File listed in GET /api/files"

print_heading "Phase 1 Report"
printf "Login response: %s...\n" "$(printf '%s' "$LOGIN_RESPONSE" | cut -c1-200)"
printf "Upload response snippet: %s...\n" "$(printf '%s' "$UPLOAD_RESPONSE" | cut -c1-200)"
printf 'Full file entry: %s\n' "$EXISTING"
printf "Document size (bytes): %s\n" "$(printf '%s' "$EXISTING" | jq -r '.bytes // "unknown"')"
printf "Stored text length: %s\n" "$(printf '%s' "$EXISTING" | jq -r '.text | length // 0')"

print_success "Phase 1 test completed"
