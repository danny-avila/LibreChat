#!/bin/bash

PROTOCOL="http"
HOST="librechat-alb-1920668103.us-east-1.elb.amazonaws.com"
JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2ZWFkOWQ2OGZlZGE2MmQzZTA0NGJjMiIsInVzZXJuYW1lIjoidW5rbm93biIsInByb3ZpZGVyIjoibG9jYWwiLCJlbWFpbCI6InVua25vd25AZ21haWwuY29tIiwiaWF0IjoxNzI3MTg3NzE1LCJleHAiOjE3NTgyOTE3MTV9.vE1kPJtwJQckYV2bft-4uprez1V0MRjgrBobH7cyCgY"

CONVERSATION_ID="$(uuidgen)"
PARENT_MESSAGE_ID="00000000-0000-0000-0000-000000000000"
MODEL="gpt-4"
MAX_MESSAGES=10

send_message() {
  local text="$1"
  
  response=$(curl -s -X POST "$PROTOCOL://$HOST/api/ask/openAI" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0" \
    -H "Content-Type: application/json" \
    -d '{
      "conversationId": "'"$CONVERSATION_ID"'",
      "text": "'"$text"'",
      "endpoint": "openAI",
      "model": "'"$MODEL"'",
      "parentMessageId": "'"$PARENT_MESSAGE_ID"'"
    }')
  
  echo "Response: $response" 
  CONVERSATION_ID=$(echo "$response" | jq -r '.message.conversationId')
  PARENT_MESSAGE_ID=$(echo "$response" | jq -r '.message.messageId')
  echo "Message sent: $text"
}

retrieve_messages() {
  messages=$(curl -s -X GET "$PROTOCOL://$HOST/api/messages/$CONVERSATION_ID" \
    -H "Authorization: Bearer $JWT_TOKEN")
  
  echo "Conversation messages:"
  echo "$messages" | jq '.[] | {sender: .sender, text: .text}'
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

