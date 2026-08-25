# Azure OpenAI Sora Video Generation Integration Guide

This guide details how to configure and use OpenAI's Sora Video Generation model via Azure OpenAI inside LibreChat.

---

## 1. Prerequisites & Azure Deployment

To generate videos using Sora on Azure OpenAI:
1. Ensure your Azure subscription has access to the **Azure OpenAI Sora Preview**.
2. Deploy the `sora` model in your Azure OpenAI resource (e.g. Deployment Name: `sora-preview`).
3. Note your Azure Endpoint and API Key from the Azure Portal.

---

## 2. Configuration (`librechat.yaml`)

Add the Azure OpenAI Sora configuration under your `endpoints.custom` or `endpoints.azureOpenAI` section:

```yaml
endpoints:
  azureOpenAI:
    titleModel: "gpt-4o-mini"
    plugins: true
    groups:
      - group: "azure-sora"
        apiKey: "${AZURE_OPENAI_API_KEY}"
        instanceName: "your-azure-resource-name"
        deploymentName: "sora-preview"
        version: "2024-10-01-preview"
        models:
          sora:
            displayName: "Sora Video Generation (Azure)"
            capabilities:
              video_generation: true
              resolutions: ["720p", "1080p"]
              max_duration_seconds: 20
```

---

## 3. Environment Variables (`.env`)

```env
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_SORA_DEPLOYMENT=sora-preview
```

---

## 4. Usage & Video Prompting

Once configured, select **Sora Video Generation (Azure)** from the model dropdown:
- Input your prompt: `A cinematic slow-motion drone shot over misty mountains at sunrise.`
- The Azure endpoint will generate and return the resulting video MP4 embed directly in the chat interface.
