# AWS Bedrock Custom Inference Profiles

This document explains how to configure and use AWS Bedrock custom inference profiles with LibreChat.

## Overview

AWS Bedrock allows you to create custom inference profiles that wrap underlying foundation models. These profiles have ARNs that don't contain the model name information, which can cause LibreChat to fail to recognize their capabilities.

## Creating Custom Inference Profiles

**Important**: Custom inference profiles can only be created via API calls (AWS CLI, SDK, etc.) and cannot be created from the AWS Console.

### Prerequisites

Before creating custom inference profiles, ensure you have:

1. **AWS CLI installed and configured** with appropriate permissions
2. **AWS credentials** with Bedrock permissions (`bedrock:CreateInferenceProfile`)
3. **Python 3.7+ with boto3** (if using Python method)
4. **Knowledge of the foundation model ARN** you want to wrap

### Method 1: Using AWS CLI (Recommended)

#### Step 1: List Available Foundation Models

First, find the ARN of the foundation model you want to wrap:

```bash
# List all available foundation models
aws bedrock list-foundation-models --region us-west-2

# Filter for specific model types (e.g., Claude models)
aws bedrock list-foundation-models --region us-west-2 --query "modelSummaries[?contains(modelId, 'claude')]"
```

#### Step 2: Create the Custom Inference Profile

```bash
aws bedrock create-inference-profile \
  --inference-profile-name "MyLibreChatProfile" \
  --description "Custom inference profile for LibreChat application" \
  --model-source copyFrom="arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0" \
  --tags Key=Project,Value=LibreChat Key=Environment,Value=Production
```

**Parameters explained:**
- `--inference-profile-name`: A unique name for your profile
- `--description`: Human-readable description
- `--model-source copyFrom`: The ARN of the foundation model to wrap
- `--tags`: Optional tags for organization and cost tracking

#### Step 3: Verify Creation

```bash
# List your inference profiles
aws bedrock list-inference-profiles --region us-west-2

# Get details of your specific profile
aws bedrock get-inference-profile \
  --inference-profile-name "MyLibreChatProfile" \
  --region us-west-2
```

### Method 2: Using Python Script

#### Step 1: Install Required Dependencies

```bash
pip install boto3
```

#### Step 2: Create Python Script

Create a file named `create_inference_profile.py`:

```python
import boto3
import json

def create_inference_profile():
    # Initialize the Bedrock client
    bedrock = boto3.client(service_name='bedrock', region_name='us-west-2')
    
    # Define the parameters for the inference profile
    inference_profile_name = 'MyLibreChatProfile'
    description = 'Custom inference profile for LibreChat application'
    
    # Replace with the actual ARN of the foundation model you want to associate
    # You can get this from the Bedrock console or by using list_foundation_models()
    model_arn = 'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0'
    
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
                'copyFrom': model_arn  # Use 'copyFrom' to specify the model ARN
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

#### Step 3: Run the Script

```bash
python create_inference_profile.py
```

### Method 3: Using AWS SDK (Node.js/JavaScript)

#### Step 1: Install Dependencies

```bash
npm install @aws-sdk/client-bedrock
```

#### Step 2: Create JavaScript Script

Create a file named `create_inference_profile.js`:

```javascript
const { BedrockClient, CreateInferenceProfileCommand } = require('@aws-sdk/client-bedrock');

async function createInferenceProfile() {
    const client = new BedrockClient({ region: 'us-west-2' });
    
    const params = {
        inferenceProfileName: 'MyLibreChatProfile',
        description: 'Custom inference profile for LibreChat application',
        modelSource: {
            copyFrom: 'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0'
        },
        tags: [
            { key: 'Project', value: 'LibreChat' },
            { key: 'Environment', value: 'Production' }
        ]
    };
    
    try {
        const command = new CreateInferenceProfileCommand(params);
        const response = await client.send(command);
        
        console.log('✅ Application inference profile created successfully!');
        console.log(`📋 Profile ARN: ${response.inferenceProfileArn}`);
        console.log(`🔗 Profile Name: ${response.inferenceProfileName}`);
        
        return response.inferenceProfileArn;
    } catch (error) {
        console.error('❌ Error creating application inference profile:', error);
        return null;
    }
}

createInferenceProfile();
```

#### Step 3: Run the Script

```bash
node create_inference_profile.js
```

### Step-by-Step Walkthrough Example

Let's walk through creating a custom inference profile for Claude 3 Sonnet:

#### 1. **Find the Foundation Model ARN**

```bash
# List Claude models
aws bedrock list-foundation-models --region us-west-2 --query "modelSummaries[?contains(modelId, 'claude-3-sonnet')]"
```

**Output example:**
```json
[
    {
        "modelId": "anthropic.claude-3-sonnet-20240229-v1:0",
        "modelArn": "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
    }
]
```

#### 2. **Create the Custom Profile**

```bash
aws bedrock create-inference-profile \
  --inference-profile-name "LibreChat-Claude-Sonnet" \
  --description "Custom inference profile for LibreChat using Claude 3 Sonnet" \
  --model-source copyFrom="arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0" \
  --tags Key=Project,Value=LibreChat Key=Model,Value=Claude3Sonnet Key=Environment,Value=Production
```

#### 3. **Get Your Profile ARN**

```bash
aws bedrock get-inference-profile \
  --inference-profile-name "LibreChat-Claude-Sonnet" \
  --region us-west-2 \
  --query "inferenceProfileArn"
```

**Output example:**
```
"arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/abc123def456"
```

#### 4. **Configure LibreChat**

Add to your `.env` file:

```bash
# Add the custom profile ARN to available models
BEDROCK_AWS_MODELS="arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/abc123def456"

# Map the custom profile to the underlying model
BEDROCK_INFERENCE_PROFILE_MAPPINGS='{
  "arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/abc123def456": "anthropic.claude-3-sonnet-20240229-v1:0"
}'
```

### Best Practices for Naming and Tagging

#### **Naming Convention:**
- Use descriptive names: `librechat-production-claude-sonnet`
- Include environment: `librechat-dev-claude-haiku`
- Include model type: `librechat-claude-opus-2024`

#### **Recommended Tags:**
```bash
--tags \
  Key=Project,Value=LibreChat \
  Key=Environment,Value=Production \
  Key=Model,Value=Claude3Sonnet \
  Key=Owner,Value=your-team \
  Key=CostCenter,Value=AI-Development
```

### Troubleshooting Creation Issues

#### **Common Errors and Solutions:**

1. **"Access Denied" Error:**
   - Ensure your IAM user/role has `bedrock:CreateInferenceProfile` permission
   - Check that you're in the correct AWS region

2. **"Model Not Found" Error:**
   - Verify the foundation model ARN is correct
   - Ensure the model is available in your region
   - Check the model ID format

3. **"Profile Name Already Exists" Error:**
   - Use a unique name for your inference profile
   - Check existing profiles: `aws bedrock list-inference-profiles`

4. **"Invalid ARN Format" Error:**
   - Ensure the ARN follows the correct format
   - Foundation model ARN format: `arn:aws:bedrock:region::foundation-model/model-id`

### Next Steps After Creation

Once you've created your custom inference profile:

1. **Test the profile** with a simple Bedrock API call
2. **Configure LibreChat** using the environment variables above
3. **Verify functionality** in the LibreChat interface
4. **Monitor usage** through AWS CloudWatch and Cost Explorer

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