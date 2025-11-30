#!/bin/bash

PROTOCOL="http"
HOST="librechat-alb-1920668103.us-east-1.elb.amazonaws.com"
JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2YjhmNDFiMmM2YzgzMjE5MTRmZDI4ZCIsInVzZXJuYW1lIjoidG9tIiwicHJvdmlkZXIiOiJsb2NhbCIsImVtYWlsIjoidG9tYXNAdmFsZXJlcmVhbG1zLmNvbSIsImlhdCI6MTcyNzIwOTU1MiwiZXhwIjoxNzU4MzEzNTUyfQ.XrFGMU2eHDbiB8JRb1vc8hZZGlWQ6Xj1GOTAwwIfHsg"

CONVERSATION_ID="00000000-0000-0000-0000-000000000006"
PARENT_MESSAGE_ID="00000000-0000-0000-0000-000000000000"
ENDPOINT="openAI"
MODEL="gpt-4"
MAX_MESSAGES=1000

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

send_message() {
  local text="$1"

  response=$(curl -s -X POST "$PROTOCOL://$HOST/api/ask/openAI" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0" \
    -H "Content-Type: application/json" \
    -d '{
      "conversationId": "'"$CONVERSATION_ID"'",
      "text": "'"$text"'",
      "endpoint": "'"$ENDPOINT"'",
      "model": "'"$MODEL"'",
      "parentMessageId": "'"$PARENT_MESSAGE_ID"'"
    }')

  last_message=$(echo "$response" | grep 'data:' | sed 's/^data: //g' | tail -n 1)

  if [ -z "$last_message" ]; then
    echo "Error: No valid message found in the response."
    return 1
  fi

  if ! echo "$last_message" | jq -e '. | has("final") and has("conversation") and has("requestMessage") and has("responseMessage")' > /dev/null; then
    echo "Error: The response does not match the expected structure."
    return 1
  fi

  message_id=$(echo "$last_message" | jq -r '.responseMessage.messageId')
  message_text=$(echo "$last_message" | jq -r '.responseMessage.text')

  if [ "$message_id" = "null" ] || [ "$message_text" = "null" ]; then
    echo "Error: Invalid message data received."
    echo "Full response: $last_message"
    return 1
  fi

  #echo "Message ID: $message_id"
  echo "   - $message_text"

  PARENT_MESSAGE_ID=$message_id
}

retrieve_messages() {
  messages=$(curl -s -X GET "$PROTOCOL://$HOST/api/messages/$CONVERSATION_ID" \
    -H "Authorization: Bearer $JWT_TOKEN")

  total_messages=$(echo "$messages" | jq 'length')

  first_sender=$(echo "$messages" | jq -r '.[0].sender')
  last_sender=$(echo "$messages" | jq -r '.[-1].sender')

  first_created_at=$(echo "$messages" | jq -r '.[0].createdAt')
  last_created_at=$(echo "$messages" | jq -r '.[-1].createdAt')

  echo -e "${GREEN}Conversation Metadata Summary:${NC}"
  echo -e "${CYAN}Total messages:${NC} $total_messages"
  echo -e "${YELLOW}First sender:${NC} $first_sender"
  echo -e "${YELLOW}Last sender:${NC} $last_sender"
  echo -e "${BLUE}First message created at:${NC} $first_created_at"
  echo -e "${BLUE}Last message created at:${NC} $last_created_at"
}

set_title() {
  local title="$1"
  curl -s -X POST "$PROTOCOL://$HOST/api/convos/update" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "arg": {
        "conversationId": "'"$CONVERSATION_ID"'",
        "title": "'"$title"'"
      }
    }'
  echo "Title set to: $title"
}

for ((i=1; i<=MAX_MESSAGES; i++))
do
  echo "Enter a message to send (or type 'exit' to stop):"
  read message
  if [ "$message" == "exit" ]; then
    break
  fi
  send_message "$message"
  retrieve_messages
done

set_title "Conversation about random stuff"

