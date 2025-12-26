# AWS Bedrock Custom Inference Profile Support

## Problem

AWS Bedrock custom inference profiles have ARNs that don't contain model name information, causing LibreChat to fail to recognize their capabilities. This prevents features like thinking, temperature, topP, and topK parameters from being available.

## Solution

### 1. Enhanced Model Detection

**File: `api/utils/tokens.js`**
- Added `detectBedrockInferenceProfileModel()` function to detect custom inference profile ARNs
- Added `loadBedrockInferenceProfileMappings()` function to load configuration from environment variables
- Enhanced `matchModelName()` to handle custom inference profiles with proper recursion handling
- Enhanced `getModelMaxTokens()` and `getModelMaxOutputTokens()` to handle custom inference profiles
- Added configuration support via `BEDROCK_INFERENCE_PROFILE_MAPPINGS` environment variable
- Added `maxOutputTokensMap` to exports and included bedrock endpoint

### 2. Updated Anthropic Helpers

**File: `api/server/services/Endpoints/anthropic/helpers.js`**
- Added `isClaudeModelWithAdvancedFeatures()` function
- Enhanced model detection to handle ARN patterns
- Updated reasoning configuration for custom inference profiles
- Added ARN pattern detection in all model capability checks

### 3. Updated LLM Configuration

**File: `api/server/services/Endpoints/anthropic/llm.js`**
- Added ARN pattern detection for custom inference profiles
- Enhanced parameter handling (topP, topK) for custom profiles
- Updated thinking configuration logic

### 4. Updated Data Provider Schemas

**File: `packages/data-provider/src/schemas.ts`**
- Enhanced `maxOutputTokens` configuration to handle custom inference profiles
- Added ARN pattern detection in token settings
- Added missing `promptCache` property to anthropicSettings
- **Fixed token limit issue**: Custom inference profiles now use correct token limits (4096 instead of 8192)

### 5. Updated Bedrock Input Parser

**File: `packages/data-provider/src/bedrock.ts`**
- Enhanced model detection to handle custom inference profiles
- Added support for thinking and other advanced features
- Updated model capability detection logic

### 6. Fixed Agent Provider Detection

**File: `api/server/services/Endpoints/agents/agent.js`**
- Fixed issue where agent provider was being set to model name instead of endpoint name
- Added debugging to identify ARN vs endpoint confusion
- Ensured provider is correctly set to endpoint name for proper routing

### 7. Fixed AWS Region Configuration

**File: `.env`**
- Fixed malformed region setting that was causing `Invalid URL` errors
- Removed comment from `BEDROCK_AWS_DEFAULT_REGION=us-west-2`

### 8. Documentation

All documentation has been consolidated into this `SOLUTION_SUMMARY.md` file, including:
- Comprehensive guide for configuring custom inference profiles
- Step-by-step creation instructions using AWS CLI and Python
- Troubleshooting and examples
- Environment variable configuration instructions

## Configuration

### Environment Variable Setup

To use custom inference profiles, set the `BEDROCK_INFERENCE_PROFILE_MAPPINGS` environment variable:

```bash
export BEDROCK_INFERENCE_PROFILE_MAPPINGS='{
  "arn:aws:bedrock:us-west-2:007376685526:application-inference-profile/if7f34w3k1mv": "anthropic.claude-3-sonnet-20240229-v1:0"
}'
```

### Creating Custom Inference Profiles

**Important**: Custom inference profiles can only be created via API calls (AWS CLI, SDK, etc.) and cannot be created from the AWS Console.

#### Prerequisites

Before creating custom inference profiles, ensure you have:

1. **AWS CLI installed and configured** with appropriate permissions
2. **AWS credentials** with Bedrock permissions (`bedrock:CreateInferenceProfile`)
3. **Python 3.7+ with boto3** (if using Python method)
4. **Knowledge of the foundation model ARN** you want to wrap

#### Method 1: Using AWS CLI (Recommended)

**Step 1: List Available Foundation Models**

```bash
# List all available foundation models
aws bedrock list-foundation-models

# Filter for specific model types (e.g., Claude models)
aws bedrock list-foundation-models --query "modelSummaries[?contains(modelId, 'claude')]"
```

**Step 2: Create the Custom Inference Profile**

```bash
export PROFILE_ARN=$(aws bedrock list-inference-profiles | jq -r '.inferenceProfileSummaries[0].inferenceProfileArn')

aws bedrock create-inference-profile \
  --inference-profile-name "MyLibreChatProfile" \
  --description "Custom inference profile for LibreChat application" \
  --model-source copyFrom="$PROFILE_ARN"
```

**Step 3: Verify Creation**

```bash
# List your inference profiles
aws bedrock list-inference-profiles

# Get details of your specific profile
aws bedrock get-inference-profile \
  --inference-profile-name "MyLibreChatProfile"
```

#### Method 2: Using Python Script

**Step 1: Install Required Dependencies**

```bash
pip install boto3
```

**Step 2: Create Python Script**

Create a file named `create_inference_profile.py`:

```python
import os
import boto3
import json

AWS_REGION='us-west-2'

def create_inference_profile():
    # Initialize the Bedrock client
    bedrock = boto3.client(service_name='bedrock', region_name=AWS_REGION)
    resp = bedrock.list_inference_profiles()
    profile_arn = resp["inferenceProfileSummaries"][0]["inferenceProfileArn"]

    # Define the parameters for the inference profile
    inference_profile_name = 'MyLibreChatProfile'
    description = 'Custom inference profile for LibreChat application'

    tags = [
        {'key': 'Project', 'value': 'LibreChat'},
        {'key': 'Environment', 'value': 'Production'},
        {'key': 'Owner', 'value': 'your-username'}
    ]

    try:
        # Call the create_inference_profile API
        response = bedrock.create_inference_profile(
            inferenceProfileName=inference_profile_name,
            description=description,
            modelSource={
                'copyFrom': profile_arn  # Use 'copyFrom' to specify the model ARN
            },
            tags=tags
        )

        print(f"✅ Application inference profile '{inference_profile_name}' created successfully!")
        print(f"📋 Profile ARN: {response['inferenceProfileArn']}")
        print(f"🔗 Profile Name: {response['inferenceProfileName']}")

        return response['inferenceProfileArn']

    except Exception as e:
        print(f"❌ Error creating application inference profile: {e}")
        return None

if __name__ == "__main__":
    create_inference_profile()
```

**Step 3: Run the Script**

```bash
python create_inference_profile.py
```

### Adding Models to LibreChat

1. Add your custom inference profile ARNs to the `BEDROCK_AWS_MODELS` environment variable:

```bash
export BEDROCK_AWS_MODELS="arn:aws:bedrock:us-east-1:123456789123:application-inference-profile/rf3zeruqfake,arn:aws:bedrock:us-west-2:123456789123:application-inference-profile/abc123def456"
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

### Common Creation Errors

1. **"Access Denied" Error:**
   - Ensure your IAM user/role has `bedrock:CreateInferenceProfile` permission
   - Check that you're in the correct AWS region

2. **"Model Not Found" Error:**
   - Verify the foundation model ARN is correct
   - Ensure the model is available in your region

3. **"Profile Name Already Exists" Error:**
   - Use a unique name for your inference profile
   - Check existing profiles: `aws bedrock list-inference-profiles`

## Example Configuration

```bash
# Environment variables
export BEDROCK_AWS_ACCESS_KEY_ID="your-access-key"
export BEDROCK_AWS_SECRET_ACCESS_KEY="your-secret-key"
export BEDROCK_AWS_DEFAULT_REGION="us-east-1"
export BEDROCK_AWS_MODELS="arn:aws:bedrock:us-east-1:123456789123:application-inference-profile/abc123def456"
export BEDROCK_INFERENCE_PROFILE_MAPPINGS='{
  "arn:aws:bedrock:us-east-1:123456789123:application-inference-profile/abc123def456": "anthropic.claude-3-7-sonnet-20250219-v1:0"
}'
```

### Testing

The implementation has been thoroughly tested with the following scenarios:
- ✅ ARN detection without mapping (returns null)
- ✅ ARN detection with mapping (returns underlying model)
- ✅ Model matching (maps ARN to underlying model pattern)
- ✅ Context token limit detection (200000 for Claude 3 Sonnet)
- ✅ Output token limit detection (4096 for Claude 3 Sonnet)
- ✅ Regular model handling (non-ARN models work as before)
- ✅ Server connectivity and endpoint availability
- ✅ Environment configuration validation

## Key Fixes Applied

1. **Provider Detection Fix**: Fixed issue where agent provider was being set to model name (ARN) instead of endpoint name
2. **Recursion Handling**: Added internal functions to prevent infinite recursion when processing custom inference profiles
3. **Token Limit Detection**: Enhanced both context and output token detection for custom inference profiles
4. **Export Fixes**: Added missing exports for proper module access
5. **Endpoint Mapping**: Added bedrock endpoint to maxOutputTokensMap for proper output token detection
6. **Token Limit Validation Fix**: Fixed custom inference profiles to use correct token limits (4096 instead of 8192)
7. **AWS Region Configuration Fix**: Fixed malformed region setting that was causing URL errors

## Usage

Once configured, custom inference profile ARNs will be automatically detected and mapped to their underlying models, enabling all the features that the underlying model supports (thinking, temperature, topP, topK, etc.).

The system will now correctly:
- Recognize custom inference profile ARNs
- Map them to underlying models via configuration
- Apply the correct token limits and capabilities
- Enable advanced features like thinking and reasoning
- Handle both context and output token limits properly
- Avoid configuration and URL errors

## Final Status

🎉 **GitHub Issue #6710 has been completely resolved!**

All tests pass:
- ✅ Token limit issue: RESOLVED
- ✅ Provider detection issue: RESOLVED
- ✅ Model detection: WORKING
- ✅ Environment configuration: WORKING
- ✅ Server connectivity: WORKING

The implementation is production-ready and users can now use AWS Bedrock custom inference profiles without any issues.