#!/usr/bin/env bash
#
# Live integration tests for the Responses API endpoint.
# Sends curl requests to a running LibreChat server to verify
# multi-turn conversations with output_text / refusal blocks work.
#
# Usage:
#   ./responses-api.live.test.sh <BASE_URL> <API_KEY> <AGENT_ID>
#
# Example:
#   ./responses-api.live.test.sh http://localhost:3080 sk-abc123 agent_xyz

set -euo pipefail

BASE_URL="${1:?Usage: $0 <BASE_URL> <API_KEY> <AGENT_ID>}"
API_KEY="${2:?Usage: $0 <BASE_URL> <API_KEY> <AGENT_ID>}"
AGENT_ID="${3:?Usage: $0 <BASE_URL> <API_KEY> <AGENT_ID>}"

ENDPOINT="${BASE_URL}/v1/responses"
PASS=0
FAIL=0

# ── Helpers ───────────────────────────────────────────────────────────

post_json() {
  local label="$1"
  local body="$2"
  local stream="${3:-false}"

  echo "──────────────────────────────────────────────"
  echo "TEST: ${label}"
  echo "──────────────────────────────────────────────"

  local http_code
  local response

  if [ "$stream" = "true" ]; then
    # For streaming, just check we get a 200 and some SSE data
    response=$(curl -s -w "\n%{http_code}" \
      -X POST "${ENDPOINT}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${API_KEY}" \
      -d "${body}" \
      --max-time 60)
  else
    response=$(curl -s -w "\n%{http_code}" \
      -X POST "${ENDPOINT}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${API_KEY}" \
      -d "${body}" \
      --max-time 60)
  fi

  http_code=$(echo "$response" | tail -1)
  local body_out
  body_out=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    echo "  ✓ HTTP 200"
    PASS=$((PASS + 1))
  else
    echo "  ✗ HTTP ${http_code}"
    echo "  Response: ${body_out}"
    FAIL=$((FAIL + 1))
  fi

  # Print truncated response for inspection
  echo "  Response (first 300 chars): ${body_out:0:300}"
  echo ""

  # Return the body for chaining
  echo "$body_out"
}

extract_response_id() {
  # Extract "id" field from JSON response
  echo "$1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4
}

# ── Test 1: Basic single-turn request ─────────────────────────────────

RESP1=$(post_json "Basic single-turn request" "$(cat <<EOF
{
  "model": "${AGENT_ID}",
  "input": "Say hello in exactly 5 words.",
  "stream": false
}
EOF
)")

# ── Test 2: Multi-turn with output_text assistant blocks ──────────────

post_json "Multi-turn with output_text blocks (the original bug)" "$(cat <<EOF
{
  "model": "${AGENT_ID}",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": [{"type": "input_text", "text": "What is 2+2?"}]
    },
    {
      "type": "message",
      "role": "assistant",
      "content": [{"type": "output_text", "text": "2+2 equals 4.", "annotations": [], "logprobs": []}]
    },
    {
      "type": "message",
      "role": "user",
      "content": [{"type": "input_text", "text": "And what is 3+3?"}]
    }
  ],
  "stream": false
}
EOF
)" > /dev/null

# ── Test 3: Multi-turn with refusal blocks ────────────────────────────

post_json "Multi-turn with refusal blocks" "$(cat <<EOF
{
  "model": "${AGENT_ID}",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": [{"type": "input_text", "text": "Do something bad"}]
    },
    {
      "type": "message",
      "role": "assistant",
      "content": [{"type": "refusal", "refusal": "I cannot help with that."}]
    },
    {
      "type": "message",
      "role": "user",
      "content": [{"type": "input_text", "text": "OK, just say hello then."}]
    }
  ],
  "stream": false
}
EOF
)" > /dev/null

# ── Test 4: Streaming request ─────────────────────────────────────────

post_json "Streaming single-turn request" "$(cat <<EOF
{
  "model": "${AGENT_ID}",
  "input": "Say hi in one word.",
  "stream": true
}
EOF
)" "true" > /dev/null

# ── Test 5: Back-and-forth using previous_response_id ─────────────────

RESP5=$(post_json "First turn for previous_response_id chain" "$(cat <<EOF
{
  "model": "${AGENT_ID}",
  "input": "Remember this number: 42. Just confirm you got it.",
  "stream": false
}
EOF
)")

RESP5_ID=$(extract_response_id "$RESP5")

if [ -n "$RESP5_ID" ]; then
  echo "  Extracted response ID: ${RESP5_ID}"
  post_json "Follow-up using previous_response_id" "$(cat <<EOF
{
  "model": "${AGENT_ID}",
  "input": "What number did I ask you to remember?",
  "previous_response_id": "${RESP5_ID}",
  "stream": false
}
EOF
)" > /dev/null
else
  echo "  ⚠ Could not extract response ID, skipping follow-up test"
  FAIL=$((FAIL + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────

echo "══════════════════════════════════════════════"
echo "RESULTS: ${PASS} passed, ${FAIL} failed"
echo "══════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
