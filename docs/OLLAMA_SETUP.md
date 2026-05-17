# Ollama Integration - Free Local AI Agent for LibreChat

This guide explains how to set up LibreChat with Ollama for **completely free, local AI agent work** without any API costs.

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- At least 8GB RAM (16GB+ recommended for larger models)
- 20GB+ free disk space for models

### 2. Start Services

```bash
# Start all services including Ollama
docker compose up -d

# Setup recommended models (first time only)
./scripts/setup-ollama.sh
```

### 3. Access LibreChat

Open http://localhost:3080 in your browser and select **Ollama** from the model dropdown.

## Available Models

The setup script installs these recommended models:

| Model | Size | Best For |
|-------|------|----------|
| `llama3.2:latest` | ~3B | Fast responses, general tasks |
| `llama3.1:latest` | ~8B | Complex reasoning, analysis |
| `codellama:latest` | ~7B | Code generation, programming |
| `deepseek-coder:latest` | ~7B | Advanced coding tasks |
| `qwen2:latest` | ~7B | Agent tasks, tool usage |
| `mistral:latest` | ~7B | Fast, efficient processing |

### Installing Additional Models

```bash
# Via Docker
docker exec ollama ollama pull <model-name>

# Examples:
docker exec ollama ollama pull mixtral:latest     # Mixture of experts
docker exec ollama ollama pull llama3.1:70b       # Large model (needs 48GB+ RAM)
docker exec ollama ollama pull phi3:latest        # Small, fast model
docker exec ollama ollama pull gemma2:latest      # Google's model
```

## Configuration

### librechat.yaml

The main configuration file (`librechat.yaml`) defines:
- Ollama endpoints and available models
- Model presets for quick selection
- File upload settings
- Agent capabilities

### Environment Variables

Key variables in `.env`:

```bash
# Ollama server URL
OLLAMA_BASE_URL=http://ollama:11434

# For local Ollama (outside Docker)
# OLLAMA_BASE_URL=http://localhost:11434
```

## Production Deployment

### Build and Deploy

```bash
# Run full production build and start
./scripts/production-build.sh all

# Or step by step:
./scripts/production-build.sh check    # Check prerequisites
./scripts/production-build.sh setup    # Setup environment
./scripts/production-build.sh docker   # Build Docker images
./scripts/production-build.sh start    # Start services
```

### GPU Support (NVIDIA)

For faster inference, enable GPU support by editing `docker-compose.override.yml`:

```yaml
ollama:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

### Memory Optimization

For systems with limited RAM:

1. Use smaller models (`llama3.2:latest`, `phi3:latest`)
2. Set Ollama memory limits in `docker-compose.override.yml`:

```yaml
ollama:
  environment:
    - OLLAMA_MAX_LOADED_MODELS=1
    - OLLAMA_NUM_PARALLEL=1
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        LibreChat                             │
│                    http://localhost:3080                     │
├─────────────────────────────────────────────────────────────┤
│                           │                                  │
│     ┌─────────────────────┼─────────────────────┐           │
│     │                     │                     │           │
│     ▼                     ▼                     ▼           │
│ ┌────────┐          ┌──────────┐          ┌────────────┐   │
│ │ Ollama │          │ MongoDB  │          │ MeiliSearch│   │
│ │ :11434 │          │ :27017   │          │   :7700    │   │
│ └────────┘          └──────────┘          └────────────┘   │
│     │                                                       │
│     ▼                                                       │
│ ┌────────────────────────────────────────┐                 │
│ │            Local Models                 │                 │
│ │  llama3.2, llama3.1, codellama, etc.   │                 │
│ └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### Ollama Not Responding

```bash
# Check Ollama logs
docker logs ollama

# Restart Ollama
docker compose restart ollama

# Check if models are loaded
docker exec ollama ollama list
```

### Model Not Loading

```bash
# Check available disk space
df -h

# Check memory usage
docker stats ollama

# Try smaller model
docker exec ollama ollama pull phi3:latest
```

### Slow Inference

1. Enable GPU support if available
2. Use smaller models for faster responses
3. Reduce `num_ctx` in model parameters
4. Increase system RAM

## Benefits of Local AI

- **Zero API Costs**: No usage fees, unlimited requests
- **Privacy**: Data never leaves your machine
- **No Rate Limits**: Process as fast as your hardware allows
- **Offline Capable**: Works without internet connection
- **Customizable**: Fine-tune models for specific tasks

## Support

- LibreChat Docs: https://www.librechat.ai/docs
- Ollama Docs: https://ollama.ai/library
- GitHub Issues: https://github.com/danny-avila/LibreChat/issues
