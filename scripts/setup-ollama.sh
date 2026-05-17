#!/bin/bash

# Ollama Setup Script for LibreChat
# This script downloads recommended models for free local AI agent work

set -e

echo "=========================================="
echo "  Ollama Model Setup for LibreChat"
echo "  Free Local AI Agent Configuration"
echo "=========================================="
echo ""

# Check if Ollama is running
check_ollama() {
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Wait for Ollama to be ready
wait_for_ollama() {
    echo "Waiting for Ollama to be ready..."
    for i in {1..30}; do
        if check_ollama; then
            echo "Ollama is ready!"
            return 0
        fi
        echo "Attempt $i/30 - Waiting..."
        sleep 2
    done
    echo "ERROR: Ollama is not responding. Please check if it's running."
    exit 1
}

# Pull a model with progress
pull_model() {
    local model=$1
    local description=$2
    echo ""
    echo "Pulling: $model"
    echo "  -> $description"
    docker exec ollama ollama pull "$model" || ollama pull "$model" 2>/dev/null || {
        echo "  Warning: Could not pull $model"
        return 1
    }
    echo "  Done: $model"
}

# Main setup
main() {
    echo "Checking Ollama status..."
    
    # Try to reach Ollama
    if ! check_ollama; then
        echo "Ollama is not running. Starting with Docker Compose..."
        docker compose up -d ollama
        wait_for_ollama
    else
        echo "Ollama is already running."
    fi

    echo ""
    echo "=========================================="
    echo "  Downloading Recommended Models"
    echo "=========================================="
    
    # Essential models for agent work
    echo ""
    echo "[Essential Models - Required for Agent Work]"
    pull_model "llama3.2:latest" "Fast general-purpose model (3B parameters)"
    pull_model "llama3.1:latest" "Advanced reasoning model (8B parameters)"
    
    echo ""
    echo "[Coding Models - For Development Tasks]"
    pull_model "codellama:latest" "Specialized code generation and analysis"
    pull_model "deepseek-coder:latest" "Advanced coding assistant"
    
    echo ""
    echo "[Agent-Optimized Models]"
    pull_model "qwen2:latest" "Excellent for tool usage and agent tasks"
    pull_model "mistral:latest" "Fast and efficient for various tasks"
    
    # Optional larger models (commented out by default)
    echo ""
    echo "[Optional: Larger Models - Uncomment in script if needed]"
    echo "  # mixtral:latest - Mixture of experts (47B parameters)"
    echo "  # llama3.1:70b - Large model for complex reasoning"
    # pull_model "mixtral:latest" "Mixture of experts for complex tasks"
    # pull_model "llama3.1:70b" "Large model for maximum capability"

    echo ""
    echo "=========================================="
    echo "  Setup Complete!"
    echo "=========================================="
    echo ""
    echo "Available models:"
    docker exec ollama ollama list 2>/dev/null || ollama list 2>/dev/null || echo "  (Run 'ollama list' to see installed models)"
    echo ""
    echo "To start LibreChat with Ollama:"
    echo "  docker compose up -d"
    echo ""
    echo "Access LibreChat at: http://localhost:3080"
    echo "Select 'Ollama' from the model dropdown to use free local AI."
    echo ""
}

# Run main function
main "$@"
