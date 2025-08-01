# AWS Bedrock Custom Inference Profiles

This document explains how to configure and use AWS Bedrock custom inference profiles with LibreChat.

## Overview

AWS Bedrock allows you to create custom inference profiles that wrap underlying foundation models. These profiles have ARNs that don't contain the model name information, which can cause LibreChat to fail to recognize their capabilities.

## Configuration

### Environment Variable Configuration

You can map custom inference profile ARNs to their underlying models using the `BEDROCK_INFERENCE_PROFILE_MAPPINGS` environment variable:

```bash
export BEDROCK_INFERENCE_PROFILE_MAPPINGS='{
  "arn:aws:bedrock:us-east-1:123456789123:application-inference-profile/rf3zeruqfake": "anthropic.claude-3-7-sonnet-20250219-v1:0",
  "arn:aws:bedrock:us-west-2:123456789123:application-inference-profile/abc123def": "anthropic.claude-3-5-sonnet-20241022-v1:0"
}'
```

### Adding Models to LibreChat

1. Add your custom inference profile ARNs to the `BEDROCK_AWS_MODELS` environment variable:

```bash
export BEDROCK_AWS_MODELS="arn:aws:bedrock:us-east-1:123456789123:application-inference-profile/rf3zeruqfake,arn:aws:bedrock:us-west-2:123456789123:application-inference-profile/abc123def"
```

2. Configure the mappings as shown above.

## Features Supported

When properly configured, custom inference profiles will support:

- **Thinking/Reasoning**: For Claude models that support it
- **Temperature, TopP, TopK**: All parameter controls
- **Prompt Caching**: When enabled
- **Max Tokens**: Proper token limits
- **All other LibreChat features**: Based on the underlying model capabilities

## Troubleshooting

### Model Not Recognized

If your custom inference profile is not being recognized:

1. Ensure the ARN is correctly added to `BEDROCK_AWS_MODELS`
2. Verify the mapping in `BEDROCK_INFERENCE_PROFILE_MAPPINGS` points to the correct underlying model
3. Check that the underlying model is supported by LibreChat

### Missing Features

If features like thinking or temperature controls are missing:

1. Verify the underlying model supports these features
2. Check that the mapping is correct
3. Ensure the ARN format is valid

## Example Configuration

```bash
# Environment variables
export BEDROCK_AWS_ACCESS_KEY_ID="your-access-key"
export BEDROCK_AWS_SECRET_ACCESS_KEY="your-secret-key"
export BEDROCK_AWS_DEFAULT_REGION="us-east-1"
export BEDROCK_AWS_MODELS="arn:aws:bedrock:us-east-1:123456789123:application-inference-profile/rf3zeruqfake"
export BEDROCK_INFERENCE_PROFILE_MAPPINGS='{
  "arn:aws:bedrock:us-east-1:123456789123:application-inference-profile/rf3zeruqfake": "anthropic.claude-3-7-sonnet-20250219-v1:0"
}'
```

## Future Enhancements

The current implementation uses configuration-based mapping. Future versions may include:

- Automatic detection via AWS Bedrock API calls
- Dynamic model capability detection
- Enhanced error handling and logging
- UI-based configuration management 