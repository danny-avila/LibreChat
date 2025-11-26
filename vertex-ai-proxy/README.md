# Vertex AI Claude Proxy

A pure Node.js Express proxy for using Claude models via Google Cloud Vertex AI. No Anthropic SDK required - uses direct REST API calls.

## Features

- ✅ **No SDK conflicts** - Uses only `express` and `google-auth-library`
- ✅ **Service Account Auth** - Authenticates with GCP service account JSON key
- ✅ **Streaming Support** - Full SSE streaming for real-time responses
- ✅ **Image Support** - Send images in base64 or URL format
- ✅ **File Support** - PDF and text document support
- ✅ **Anthropic-compatible API** - Works with LibreChat's AnthropicClient

## Prerequisites

1. **GCP Project** with Vertex AI API enabled
2. **Claude models enabled** in Vertex AI Model Garden
3. **Service Account** with `Vertex AI User` role

## Setup

### Step 1: Create GCP Service Account

1. Go to [GCP Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click **"Create Service Account"**
3. Name: `librechat-vertex-ai`
4. Grant role: `Vertex AI User`
5. Click **"Create Key"** → Select **JSON** → Download

### Step 2: Place the Key File

The key file should be placed in the LibreChat root directory:

```bash
# Copy your downloaded key to the LibreChat root
cp ~/Downloads/your-project-xxxxx.json /path/to/LibreChat/librechat-vertex-claude-key.json
```

⚠️ **IMPORTANT:** Never commit this file to git! (It's already in `.gitignore`)

### Step 3: Install Dependencies

```bash
cd vertex-ai-proxy
npm install
```

### Step 4: Configure Environment (Optional)

```bash
cp .env.example .env
# Edit .env if you need to change defaults
```

### Step 5: Start the Proxy

```bash
npm start
# or for development with auto-reload:
npm run dev
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VERTEX_PROXY_PORT` | `4001` | Port for the proxy server |
| `VERTEX_LOCATION` | `us-east5` | GCP region for Vertex AI |
| `GOOGLE_APPLICATION_CREDENTIALS` | `./vertex-ai-key.json` | Path to service account key |
| `GCP_PROJECT_ID` | (from key file) | GCP project ID |

## Available Models

| Model Name | Vertex AI ID |
|------------|--------------|
| `claude-sonnet-4-5` | claude-sonnet-4-5@20250929 |
| `claude-sonnet-4` | claude-sonnet-4@20250514 |
| `claude-opus-4` | claude-opus-4@20250514 |
| `claude-opus-4-5` | claude-opus-4-5@20251101 |
| `claude-haiku-4-5` | claude-haiku-4-5@20251001 |
| `claude-3-7-sonnet` | claude-3-7-sonnet@20250219 |
| `claude-3-5-sonnet-v2` | claude-3-5-sonnet-v2@20241022 |
| `claude-3-5-haiku` | claude-3-5-haiku@20241022 |

## API Endpoints

### POST /v1/messages

Anthropic-compatible messages endpoint.

```bash
curl -X POST http://localhost:4001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### With Images

```bash
curl -X POST http://localhost:4001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 1024,
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "What is in this image?"},
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/png",
              "data": "iVBORw0KGgo..."
            }
          }
        ]
      }
    ]
  }'
```

### GET /v1/models

List available models.

```bash
curl http://localhost:4001/v1/models
```

### GET /health

Health check endpoint.

```bash
curl http://localhost:4001/health
```

## LibreChat Integration

Add to your `librechat.yaml`:

```yaml
endpoints:
  custom:
    - name: "Claude Vertex AI"
      apiKey: "not-needed"
      baseURL: "http://localhost:4001/v1"
      models:
        default: ["claude-sonnet-4-5", "claude-sonnet-4", "claude-opus-4", "claude-3-5-haiku"]
        fetch: true
      titleConvo: true
      titleModel: "claude-3-5-haiku"
      modelDisplayLabel: "Claude (Vertex AI)"
```

Or use with the Anthropic endpoint:

```yaml
endpoints:
  anthropic:
    # ... other config
    reverseProxyUrl: "http://localhost:4001/v1"
```

## Troubleshooting

### "Permission denied" errors
- Ensure service account has `Vertex AI User` role
- Verify the project ID is correct
- Check if Claude models are enabled in your project

### "Model not found" errors
- Go to [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/model-garden)
- Search for "Claude" and enable the models you need

### Connection refused
- Ensure the proxy is running: `npm start`
- Check the port is not in use

### Token refresh errors
- Verify the service account key file is valid
- Check the key file path is correct

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   LibreChat     │────▶│  vertex-ai-proxy     │────▶│  Vertex AI      │
│   (Anthropic    │     │  (Express + fetch)   │     │  REST API       │
│    Client)      │◀────│  Port 4001           │◀────│                 │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
```

## Docker Usage

### Option 1: Docker Compose (Recommended)

Add to your `docker-compose.override.yml`:

```yaml
services:
  vertex-proxy:
    build: ./vertex-ai-proxy
    container_name: vertex-ai-proxy
    ports:
      - "4001:4001"
    volumes:
      - ./librechat-vertex-claude-key.json:/app/vertex-ai-key.json:ro
    environment:
      - GOOGLE_APPLICATION_CREDENTIALS=/app/vertex-ai-key.json
      - VERTEX_LOCATION=us-east5
    restart: unless-stopped
```

Then run:
```bash
docker-compose up -d vertex-proxy
```

### Option 2: Standalone Docker

```bash
cd vertex-ai-proxy

# Build the image
docker build -t vertex-ai-proxy .

# Run the container
docker run -d \
  --name vertex-ai-proxy \
  -p 4001:4001 \
  -v /path/to/your-key.json:/app/vertex-ai-key.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/vertex-ai-key.json \
  -e VERTEX_LOCATION=us-east5 \
  vertex-ai-proxy
```

### Docker with LibreChat

When running LibreChat in Docker, update your `librechat.yaml` to use the container name:

```yaml
endpoints:
  custom:
    - name: "Claude Vertex AI"
      apiKey: "not-needed"
      baseURL: "http://vertex-proxy:4001/v1"  # Use container name
      models:
        default: ["claude-sonnet-4-5", "claude-sonnet-4", "claude-opus-4"]
        fetch: true
      modelDisplayLabel: "Claude (Vertex AI)"
```

## Files

```
vertex-ai-proxy/
├── Dockerfile            # Docker build file
├── package.json          # Dependencies
├── server.js             # Main Express server
├── lib/
│   ├── auth.js           # Service account authentication
│   ├── streaming.js      # SSE stream handling
│   └── media.js          # Image/file processing
├── vertex-ai-key.json    # Service account key (create this)
├── .env.example          # Environment template
└── README.md             # This file
```
