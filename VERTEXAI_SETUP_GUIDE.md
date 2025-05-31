# Google Vertex AI Setup Guide for LibreChat

This guide explains how to enable and configure Google Vertex AI in your LibreChat deployment.

## Overview

LibreChat supports both Google AI (Gemini API) and Google Vertex AI. Vertex AI provides access to Google's latest AI models with enterprise-grade features and regional deployment options.

## Prerequisites

1. A Google Cloud Platform (GCP) account
2. A GCP project with billing enabled
3. Vertex AI API enabled in your project
4. A service account with appropriate permissions

## Step-by-Step Setup

### 1. Enable Vertex AI in Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to "APIs & Services" > "Enable APIs and Services"
4. Search for "Vertex AI API" and enable it
5. Also enable "Cloud Resource Manager API" if not already enabled

### 2. Create a Service Account

1. In Google Cloud Console, go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Give it a name (e.g., "librechat-vertex-ai")
4. Click "Create and Continue"
5. Add the following roles:
   - **Vertex AI User** (required)
   - **Service Account Token Creator** (optional, for enhanced security)
6. Click "Continue" and then "Done"

### 3. Generate Service Account Key

1. Click on the service account you just created
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose **JSON** format
5. Click "Create" - a JSON file will be downloaded

### 4. Configure LibreChat

#### Option A: User-Provided Credentials (Recommended for multi-tenant setups)

1. Add to your `.env` file:
   ```bash
   GOOGLE_KEY=user_provided
   GOOGLE_LOC=us-central1  # or your preferred region
   ```

2. Users will need to:
   - Log in to LibreChat
   - Go to Settings > AI Providers
   - Select Google/Vertex AI
   - Upload their service account JSON key
   - Save settings

#### Option B: Server-Side Configuration (Single tenant)

1. Place the service account JSON file in your LibreChat directory as `data/auth.json`

2. Add to your `.env` file:
   ```bash
   GOOGLE_KEY=your-google-api-key  # Optional, for fallback to Google AI
   GOOGLE_LOC=us-central1          # Your preferred region
   ```

### 5. Available Regions

You can set `GOOGLE_LOC` to any of these regions:
- `us-central1` (default)
- `us-east1`
- `us-west1`
- `europe-west1`
- `europe-west2`
- `europe-west4`
- `asia-northeast1`
- `asia-southeast1`

### 6. Available Models

With Vertex AI enabled, you'll have access to:

**Gemini 2.5 Series (Latest):**
- `gemini-2.5-pro` - Most intelligent model with thinking capabilities, best for complex reasoning
- `gemini-2.5-flash` - Balance of price and performance with enhanced capabilities

**Gemini 2.0 Series:**
- `gemini-2.0-flash-exp` - Latest experimental flash model
- `gemini-2.0-flash` - Newest multimodal model with next-gen features
- `gemini-2.0-flash-lite` - Optimized for cost efficiency and low latency
- `gemini-2.0-pro` - Advanced model for complex tasks

**Gemini 1.5 Series:**
- `gemini-1.5-flash` - Fast, efficient model for most tasks
- `gemini-1.5-flash-8b` - Smaller, faster variant
- `gemini-1.5-pro` - Most capable 1.5 model for complex tasks
- `gemini-1.5-pro-002` - Latest version with improvements
- `gemini-1.5-flash-002` - Latest flash version

**Gemini 1.0 Series:**
- `gemini-1.0-pro` - Previous generation pro model
- `gemini-1.0-ultra` - Previous generation ultra model

**Gemma Open Models:**
- `gemma-2-27b-it` - Largest Gemma model
- `gemma-2-9b-it` - Medium Gemma model
- `gemma-2-2b-it` - Smallest Gemma model

**Legacy Models:**
- `text-bison` / `text-bison-32k` - Text generation
- `chat-bison` / `chat-bison-32k` - Conversational AI
- `codechat-bison` / `codechat-bison-32k` - Code-focused conversations

### 7. Specialized Models (Require Additional Setup)

**Note:** These models are not directly supported in LibreChat's chat interface but are available through Vertex AI API:

**Veo 3 (Video Generation) - Private Preview:**
- Latest state-of-the-art video generation model
- Supports text-to-video and image-to-video
- Includes speech and audio generation
- **Requires:** Separate access request through [Google Form](https://cloud.google.com/vertex-ai)
- **Use via:** Vertex AI Media Studio or API

**Imagen 4 (Image Generation) - Public Preview:**
- Highest quality image generation
- Outstanding text rendering and prompt adherence
- Multilingual prompt support
- **Use via:** Vertex AI Media Studio or API

**Lyria 2 (Music Generation) - Generally Available:**
- High-fidelity music generation across styles
- Control over instruments, BPM, and characteristics
- **Use via:** Vertex AI Media Studio or API

To use these specialized models, you'll need to:
1. Access them through Vertex AI Media Studio
2. Use the Vertex AI API directly in your applications
3. Ensure your service account has appropriate permissions

## Configuration in librechat.yaml

The configuration is already set up in your `librechat.yaml`:

```yaml
endpoints:
  google:
    models:
      default: [
        # Gemini 2.5 Series (Latest)
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        # Gemini 2.0 Series
        'gemini-2.0-flash-exp',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.0-pro',
        # Gemini 1.5 Series
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
        'gemini-1.5-pro',
        'gemini-1.5-pro-002',
        'gemini-1.5-flash-002',
        # Gemini 1.0 Series
        'gemini-1.0-pro',
        'gemini-1.0-ultra',
        # Gemma Open Models
        'gemma-2-27b-it',
        'gemma-2-9b-it',
        'gemma-2-2b-it',
        # Legacy Models
        'text-bison',
        'text-bison-32k',
        'chat-bison',
        'chat-bison-32k',
        'codechat-bison',
        'codechat-bison-32k'
      ]
      fetch: true
    titleConvo: true
    titleModel: 'gemini-1.5-flash'
```

## Troubleshooting

### Common Issues

1. **"Permission denied" error**
   - Ensure the service account has "Vertex AI User" role
   - Check that Vertex AI API is enabled in your project

2. **"Invalid region" error**
   - Verify `GOOGLE_LOC` is set to a valid region
   - Some models may not be available in all regions

3. **Models not appearing**
   - Clear browser cache
   - Restart LibreChat server
   - Check that the Google endpoint is enabled in the UI

### Verifying Setup

1. After configuration, restart LibreChat:
   ```bash
   docker-compose restart
   # or
   npm run backend
   ```

2. Log in to LibreChat
3. Create a new conversation
4. Select "Google" from the model dropdown
5. You should see the Vertex AI models listed

## Safety Settings

You can configure safety settings via environment variables:

```bash
GOOGLE_SAFETY_SEXUALLY_EXPLICIT=BLOCK_MEDIUM_AND_ABOVE
GOOGLE_SAFETY_HATE_SPEECH=BLOCK_MEDIUM_AND_ABOVE
GOOGLE_SAFETY_HARASSMENT=BLOCK_MEDIUM_AND_ABOVE
GOOGLE_SAFETY_DANGEROUS_CONTENT=BLOCK_MEDIUM_AND_ABOVE
```

Valid values:
- `BLOCK_NONE`
- `BLOCK_ONLY_HIGH`
- `BLOCK_MEDIUM_AND_ABOVE`
- `BLOCK_LOW_AND_ABOVE`

## Cost Considerations

- Vertex AI pricing varies by model and region
- Monitor usage in Google Cloud Console
- Set up billing alerts to avoid unexpected charges
- Consider using `gemini-1.5-flash` for cost-effective operations

## Additional Resources

- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing)
- [LibreChat Documentation](https://www.librechat.ai/docs/configuration/ai_endpoints/google) 