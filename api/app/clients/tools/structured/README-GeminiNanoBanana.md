# Gemini Image Generation Tool

This tool enables agents to generate images using Google's Gemini Image models. It supports both **Gemini API** (consumer) and **Vertex AI** (enterprise) providers.

## Features

- **High-quality image generation** using Google's Gemini models
- **Dual provider support**: Gemini API (API key) or Vertex AI (service account)
- **Configurable model ID** via environment variable
- **Image context support**: Reference existing images for editing
- **Automatic image saving** to configured storage (Local, S3, Azure, Firebase)
- **Agent integration** with proper content formatting
- **Error handling** with fallback to data URLs

## Setup

### Provider Options

The tool supports two authentication methods:

| Provider | Auth Method                        | Best For                          |
| -------- | ---------------------------------- | --------------------------------- |
| `gemini` | `GEMINI_API_KEY` env var           | Quick setup, consumer API         |
| `vertex` | Service account JSON (`auth.json`) | Enterprise, Google Cloud projects |

### Configuration

#### Environment Variables

| Variable                  | Description                              | Default                                          |
| ------------------------- | ---------------------------------------- | ------------------------------------------------ |
| `GEMINI_IMAGE_PROVIDER`   | Provider to use: `gemini` or `vertex`    | Auto-detect (prefers `gemini` if API key is set) |
| `GEMINI_IMAGE_MODEL`      | Model ID for image generation            | `gemini-2.5-flash-preview-05-20`                 |
| `GEMINI_API_KEY`          | API key for Gemini API provider          | -                                                |
| `GOOGLE_SERVICE_KEY_FILE` | Path to service account JSON (Vertex AI) | `api/data/auth.json`                             |
| `GOOGLE_CLOUD_LOCATION`   | Google Cloud region (Vertex AI only)     | `global`                                         |

### Option 1: Gemini API (Recommended for Quick Setup)

1. Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Set environment variables:

```bash
GEMINI_API_KEY=your-api-key-here
# Optional: explicitly set provider (auto-detected if API key is present)
GEMINI_IMAGE_PROVIDER=gemini
```

### Option 2: Vertex AI (Enterprise)

1. Create a **Google Cloud Project** with Vertex AI API enabled
2. Create a **Service Account** with Vertex AI permissions
3. Download the JSON key and place it at `api/data/auth.json`
4. Set environment variables:

```bash
GEMINI_IMAGE_PROVIDER=vertex
# Optional: custom path to service account JSON
GOOGLE_SERVICE_KEY_FILE=/path/to/your/auth.json
```

### Docker Configuration

For Docker deployments using Vertex AI, mount the credentials file:

```yaml
# docker-compose.yml
services:
  api:
    volumes:
      - ./api/data/auth.json:/app/api/data/auth.json
```

### librechat.yaml

Add `gemini_image_gen` to your included tools:

```yaml
includedTools: ['calculator', 'gemini_image_gen']
```

## Usage

Agents can use this tool by calling `gemini_image_gen` with:

```json
{
  "prompt": "A detailed description of the image you want to generate",
  "image_ids": ["optional-image-id-for-context"]
}
```

### Example Prompts

- "A photorealistic image of a mountain landscape at sunset with golden lighting"
- "An oil painting of a cat sitting by a window, impressionist style"
- "A vector illustration of a modern city skyline, minimalist design"

### Image Editing (with context)

To edit or modify existing images, include the image ID:

```json
{
  "prompt": "Add sunglasses to the person in this image",
  "image_ids": ["file_abc123"]
}
```

## Technical Details

- **Default Model**: `gemini-2.5-flash-preview-05-20`
- **Response Format**: Base64-encoded PNG images
- **Storage Integration**: Uses existing LibreChat file storage strategies
- **Content Types**: Properly formatted for agent responses
- **Error Handling**: Graceful fallbacks and detailed error messages

## Troubleshooting

### Common Issues

1. **"GEMINI_API_KEY environment variable is required"**
   - Set `GEMINI_API_KEY` in your environment
   - Or set `GEMINI_IMAGE_PROVIDER=vertex` to use Vertex AI instead

2. **"Google service account credentials file not found"**
   - Ensure `api/data/auth.json` exists
   - Or set `GOOGLE_SERVICE_KEY_FILE` to the correct path
   - Or set `GEMINI_IMAGE_PROVIDER=gemini` with `GEMINI_API_KEY`

3. **"Failed to initialize Gemini client"**
   - For Gemini API: Verify your API key is valid
   - For Vertex AI: Check service account permissions

4. **"No image data returned"**
   - The prompt might violate content policies
   - Try a different, more descriptive prompt

### Debug Mode

Enable debug logging by setting the log level to debug in your configuration.
