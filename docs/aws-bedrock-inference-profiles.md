# AWS Bedrock Custom Inference Profiles

This guide explains how to set up and use AWS Bedrock custom inference profiles with LibreChat.

## Overview

AWS Bedrock custom inference profiles allow you to create application-specific configurations for foundation models. These profiles have ARNs (Amazon Resource Names) that don't contain model name information, which requires special handling in LibreChat.

## Prerequisites

- AWS CLI configured with appropriate permissions
- Python 3.7+ with boto3 installed
- LibreChat instance with Bedrock endpoint configured

## Creating Custom Inference Profiles

### Method 1: Using AWS CLI

```bash
# Create a custom inference profile
aws bedrock create-inference-profile \
  --inference-profile-name "MyLibreChatProfile" \
  --description "Custom inference profile for LibreChat application" \
  --model-source copyFrom="arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0" \
  --tags Key=Project,Value=LibreChat
```

### Method 2: Using Python Script

Create a Python script (`create_profile.py`) with the following content:

```python
import boto3

# Initialize the Bedrock client
bedrock = boto3.client(service_name='bedrock')

# Define the parameters for the inference profile
inference_profile_name = 'MyBedrockAppProfile'
description = 'Application inference profile for tracking costs of a specific application.'
# Replace with the actual ARN of the foundation model you want to associate
model_arn = 'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0'
tags = [
    {'key': 'ProfileOwner', 'value': 'your-username'},
    {'key': 'Project', 'value': 'LibreChat'}
]

try:
    # Call the create_inference_profile API
    response = bedrock.create_inference_profile(
        inferenceProfileName=inference_profile_name,
        description=description,
        modelSource={
            'copyFrom': model_arn  # Use 'copyFrom' to specify the model ARN
        },
        tags=tags
    )
    print(f"Application inference profile '{inference_profile_name}' created successfully.")
    print(f"Profile ARN: {response['inferenceProfileArn']}")

except Exception as e:
    print(f"Error creating application inference profile: {e}")
```

### Method 3: Using AWS Console

1. Go to the AWS Bedrock console
2. Navigate to "Inference profiles"
3. Click "Create inference profile"
4. Fill in the required fields:
   - **Name**: Your profile name
   - **Description**: Description of the profile
   - **Model**: Select the foundation model to copy from
   - **Tags**: Add relevant tags
5. Click "Create inference profile"

## Configuration in LibreChat

### 1. Environment Variables

Add the following environment variables to your `.env` file:

```bash
# AWS Bedrock Configuration
BEDROCK_AWS_DEFAULT_REGION=us-west-2
BEDROCK_AWS_ACCESS_KEY_ID=your-access-key
BEDROCK_AWS_SECRET_ACCESS_KEY=your-secret-key

# Custom Inference Profile Mappings
BEDROCK_INFERENCE_PROFILE_MAPPINGS='{
  "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/your-profile-id": "anthropic.claude-3-sonnet-20240229-v1:0"
}'
```

### 2. Mapping Format

The `BEDROCK_INFERENCE_PROFILE_MAPPINGS` should be a JSON object where:
- **Keys**: Your custom inference profile ARNs
- **Values**: The underlying foundation model names

Example mappings:

```json
{
  "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/profile1": "anthropic.claude-3-sonnet-20240229-v1:0",
  "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/profile2": "anthropic.claude-3-opus-20240229-v1:0",
  "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/profile3": "anthropic.claude-3-haiku-20240307-v1:0"
}
```

## Usage

### 1. In LibreChat Interface

1. Go to your LibreChat instance
2. Select "Bedrock" as the endpoint
3. Choose your custom inference profile ARN from the model dropdown
4. Configure parameters as needed (temperature, topP, topK, etc.)

### 2. API Usage

When using the API, specify your custom inference profile ARN as the model:

```json
{
  "model": "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/your-profile-id",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "temperature": 0.7,
  "topP": 0.9
}
```

## Features Supported

With custom inference profiles, LibreChat supports:

- ✅ **Temperature**: Control response randomness
- ✅ **TopP**: Nucleus sampling parameter
- ✅ **TopK**: Top-k sampling parameter
- ✅ **Max Tokens**: Control response length
- ✅ **Thinking**: Advanced reasoning (when explicitly enabled)
- ✅ **Token Limits**: Proper validation (4096 for Claude 3 Sonnet)

## Troubleshooting

### Common Issues

#### 1. "Config not found for the bedrock custom endpoint"

**Cause**: The provider detection is not working correctly.

**Solution**: Ensure your `.env` file has the correct `BEDROCK_AWS_DEFAULT_REGION` setting without comments.

#### 2. "The maximum tokens you requested exceeds the model limit"

**Cause**: Token limits are not being validated correctly for custom profiles.

**Solution**: This should be resolved in the latest version. Custom inference profiles now use the correct token limits (4096 for Claude 3 Sonnet).

#### 3. "thinking: Extra inputs are not permitted"

**Cause**: Thinking is being automatically enabled for custom profiles.

**Solution**: Thinking is no longer auto-enabled for custom inference profiles. You can explicitly enable it if needed.

#### 4. "Invalid URL" errors

**Cause**: Malformed region configuration.

**Solution**: Check your `.env` file and ensure `BEDROCK_AWS_DEFAULT_REGION` doesn't contain comments.

### Debugging

#### Check Your Mappings

Verify your mappings are loaded correctly:

```bash
# Add this to your .env file temporarily for debugging
BEDROCK_INFERENCE_PROFILE_MAPPINGS='{
  "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/test": "anthropic.claude-3-sonnet-20240229-v1:0"
}'
```

#### Test ARN Detection

You can test if your ARN is being detected correctly by checking the logs when making a request.

## Best Practices

### 1. Naming Conventions

Use descriptive names for your inference profiles:
- `librechat-production-claude-sonnet`
- `librechat-development-claude-haiku`
- `librechat-testing-claude-opus`

### 2. Tagging

Always tag your inference profiles for better organization:
- `Project=LibreChat`
- `Environment=Production`
- `Owner=your-team`

### 3. Cost Tracking

Custom inference profiles help track costs per application. Monitor usage through AWS Cost Explorer.

### 4. Security

- Use IAM roles with minimal required permissions
- Regularly rotate access keys
- Monitor API usage for unusual patterns

## Advanced Configuration

### Multiple Profiles

You can create multiple profiles for different use cases:

```json
{
  "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/chat": "anthropic.claude-3-sonnet-20240229-v1:0",
  "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/analysis": "anthropic.claude-3-opus-20240229-v1:0",
  "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/quick": "anthropic.claude-3-haiku-20240307-v1:0"
}
```

### Region Considerations

- Ensure your inference profiles are in the same region as your LibreChat instance
- Consider latency when choosing regions
- Some models may only be available in specific regions

## Monitoring and Logs

### AWS CloudWatch

Monitor your inference profile usage through CloudWatch:
- API calls per profile
- Error rates
- Response times

### LibreChat Logs

Check LibreChat logs for any issues:
```bash
# View logs
docker logs librechat-api
```

## Support

If you encounter issues:

1. Check the [LibreChat GitHub issues](https://github.com/danny-avila/LibreChat/issues)
2. Verify your AWS credentials and permissions
3. Ensure your inference profile ARN is correct
4. Check that your mappings are properly formatted

## Related Documentation

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [LibreChat Bedrock Configuration](../config/bedrock-inference-profiles.md)
- [AWS CLI Bedrock Commands](https://docs.aws.amazon.com/cli/latest/reference/bedrock/)
