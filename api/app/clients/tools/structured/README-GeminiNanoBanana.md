# Vertex AI Image Generation Tool

This tool enables agents to generate images using Google's Vertex AI Gemini 2.5 Flash Image model.

## Features

- **High-quality image generation** using Google's latest Gemini model
- **Multiple aspect ratios** supported:
  - `1:1` - Square (1024×1024)
  - `3:4` - Portrait (896×1280)
  - `4:3` - Landscape (1280×896)
  - `9:16` - Tall (768×1408)
  - `16:9` - Wide (1408×768)
- **Automatic image saving** to configured storage (Local, S3, Azure, Firebase)
- **Agent integration** with proper content formatting
- **Error handling** with fallback to data URLs

## Setup

### Prerequisites

1. **Google Cloud Project** with Vertex AI API enabled
2. **Service Account** with Vertex AI permissions
3. **Credentials file** placed at `api/data/auth.json`

### Configuration

The tool uses **credentials** from `api/data/auth.json` following the same pattern as other Google service integrations.

- **Credentials Path**: `api/data/auth.json` (automatically detected via `__dirname` resolution)
- **Environment Override**: Set `GOOGLE_SERVICE_KEY_FILE` environment variable to use a different path
- **Project ID**: Automatically extracted from the credentials file
- **Location**: `global` (hardcoded)

### Installation

The tool is automatically registered when the server starts. No additional configuration needed.

## Usage

Agents can use this tool by calling `gemini_image_gen` with:

```json
{
  "prompt": "A detailed description of the image you want to generate",
  "aspectRatio": "1:1" // Optional, defaults to "1:1"
}
```

### Example Prompts

- "A photorealistic image of a mountain landscape at sunset with golden lighting"
- "An oil painting of a cat sitting by a window, impressionist style"
- "A vector illustration of a modern city skyline, minimalist design"

## Technical Details

- **Model**: `gemini-2.5-flash-image-preview`
- **Response Format**: Base64-encoded PNG images
- **Storage Integration**: Uses existing LibreChat file storage strategies
- **Content Types**: Properly formatted for agent responses
- **Error Handling**: Graceful fallbacks and detailed error messages

## Comparison with OpenAI Tools

| Feature        | OpenAI DALL-E       | Vertex AI Gemini |
| -------------- | ------------------- | ---------------- |
| Input Format   | Multipart form data | JSON with base64 |
| Max Resolution | 1792×1024           | 1408×768         |
| Aspect Ratios  | 3 fixed sizes       | 5 aspect ratios  |
| API Cost       | Per image           | Per request      |
| Integration    | Stream-based        | Buffer-based     |

## Troubleshooting

### Common Issues

1. **"Google credentials file not found"**

   - Ensure `api/data/auth.json` exists in the correct location
   - Verify the file contains valid service account JSON

2. **"Failed to initialize Vertex AI client"**

   - Check that the service account has Vertex AI permissions
   - Ensure the project has Vertex AI API enabled
   - Verify the `project_id` in `auth.json` is correct

3. **"No image data returned"**
   - The prompt might violate content policies
   - Try a different, more descriptive prompt

### Debug Mode

Enable debug logging by setting the log level to debug in your configuration.
