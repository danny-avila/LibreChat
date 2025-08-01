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

**File: `config/bedrock-inference-profiles.md`**
- Comprehensive guide for configuring custom inference profiles
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