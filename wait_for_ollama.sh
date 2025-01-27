#!/bin/bash

# Start Ollama in the background.
ollama serve &
# Record Process ID.
pid=$!

# Pause for Ollama to start.
sleep 5

echo "🔴 Retrieving model llama3.2"
ollama pull llama3.2
echo "🟢 Done!"

# Wait for Ollama process to finish.
wait $pid