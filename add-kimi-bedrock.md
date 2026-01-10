# Add AWS Bedrock Kimi K2 Thinking (Moonshot) Support

This document describes the code changes required to add **Moonshot Kimi K2 Thinking** (`moonshot.kimi-k2-thinking`) model support to LibreChat's Bedrock endpoint.

## Model Information

- **Provider**: Moonshot AI
- **Model ID**: `moonshot.kimi-k2-thinking`
- **Context Window**: 256K tokens
- **Recommended Max Output Tokens**: 16,384+ (for full reasoning + output)
- **Recommended Temperature**: 1.0
- **AWS Regions**: `ap-northeast-1`, `ap-south-1`, and more

## Files to Modify

### 1. `packages/data-provider/src/schemas.ts`

**Location**: Around line 98-100, inside the `BedrockProviders` enum.

**Change**: Add `Moonshot = 'moonshot'` to the enum.

**Before**:
```typescript
export enum BedrockProviders {
  AI21 = 'ai21',
  Amazon = 'amazon',
  Anthropic = 'anthropic',
  Cohere = 'cohere',
  Meta = 'meta',
  MistralAI = 'mistral',
  StabilityAI = 'stability',
  DeepSeek = 'deepseek',
}
```

**After**:
```typescript
export enum BedrockProviders {
  AI21 = 'ai21',
  Amazon = 'amazon',
  Anthropic = 'anthropic',
  Cohere = 'cohere',
  Meta = 'meta',
  MistralAI = 'mistral',
  Moonshot = 'moonshot',
  StabilityAI = 'stability',
  DeepSeek = 'deepseek',
}
```

---

### 2. `packages/data-provider/src/parameterSettings.ts`

**Change 1**: Add Moonshot configuration arrays after `bedrockGeneralCol2` (around line 880).

**Insert this code block after the `bedrockGeneralCol2` definition**:

```typescript
const bedrockMoonshot: SettingsConfiguration = [
  librechat.modelLabel,
  bedrock.system,
  librechat.maxContextTokens,
  createDefinition(bedrock.maxTokens, {
    default: 16384,
  }),
  bedrock.temperature,
  bedrock.topP,
  baseDefinitions.stop,
  librechat.resendFiles,
  bedrock.region,
  librechat.fileTokenLimit,
];

const bedrockMoonshotCol1: SettingsConfiguration = [
  baseDefinitions.model as SettingDefinition,
  librechat.modelLabel,
  bedrock.system,
  baseDefinitions.stop,
];

const bedrockMoonshotCol2: SettingsConfiguration = [
  librechat.maxContextTokens,
  createDefinition(bedrock.maxTokens, {
    default: 16384,
  }),
  bedrock.temperature,
  bedrock.topP,
  librechat.resendFiles,
  bedrock.region,
  librechat.fileTokenLimit,
];
```

---

**Change 2**: Register in `paramSettings` object.

**Location**: Inside `export const paramSettings = { ... }`, after the `DeepSeek` entry.

**Add this line**:
```typescript
  [`${EModelEndpoint.bedrock}-${BedrockProviders.Moonshot}`]: bedrockMoonshot,
```

**Context** (showing surrounding lines):
```typescript
  [`${EModelEndpoint.bedrock}-${BedrockProviders.AI21}`]: bedrockGeneral,
  [`${EModelEndpoint.bedrock}-${BedrockProviders.Amazon}`]: bedrockGeneral,
  [`${EModelEndpoint.bedrock}-${BedrockProviders.DeepSeek}`]: bedrockGeneral,
  [`${EModelEndpoint.bedrock}-${BedrockProviders.Moonshot}`]: bedrockMoonshot,  // <-- ADD THIS
  [EModelEndpoint.google]: googleConfig,
```

---

**Change 3**: Register in `presetSettings` object.

**Location**: Inside `export const presetSettings = { ... }`, after the `DeepSeek` entry.

**Add this block**:
```typescript
  [`${EModelEndpoint.bedrock}-${BedrockProviders.Moonshot}`]: {
    col1: bedrockMoonshotCol1,
    col2: bedrockMoonshotCol2,
  },
```

**Context** (showing surrounding lines):
```typescript
  [`${EModelEndpoint.bedrock}-${BedrockProviders.AI21}`]: bedrockGeneralColumns,
  [`${EModelEndpoint.bedrock}-${BedrockProviders.Amazon}`]: bedrockGeneralColumns,
  [`${EModelEndpoint.bedrock}-${BedrockProviders.DeepSeek}`]: bedrockGeneralColumns,
  [`${EModelEndpoint.bedrock}-${BedrockProviders.Moonshot}`]: {  // <-- ADD THIS BLOCK
    col1: bedrockMoonshotCol1,
    col2: bedrockMoonshotCol2,
  },
  [EModelEndpoint.google]: {
    col1: googleCol1,
    col2: googleCol2,
  },
```

---

### 3. `packages/data-provider/src/bedrock.ts`

**Location**: Around line 137-140, inside the `bedrockInputParser` transform function.

**Change**: Wrap the `anthropic_beta` assignment in a conditional to only apply to Anthropic models.

**Before**:
```typescript
      if (additionalFields.thinking === true && additionalFields.thinkingBudget === undefined) {
        additionalFields.thinkingBudget = 2000;
      }
      additionalFields.anthropic_beta = ['output-128k-2025-02-19'];
    } else if (additionalFields.thinking != null || additionalFields.thinkingBudget != null) {
```

**After**:
```typescript
      if (additionalFields.thinking === true && additionalFields.thinkingBudget === undefined) {
        additionalFields.thinkingBudget = 2000;
      }
      // Only add anthropic_beta for Anthropic models
      if (typedData.model.includes('anthropic.')) {
        additionalFields.anthropic_beta = ['output-128k-2025-02-19'];
      }
    } else if (additionalFields.thinking != null || additionalFields.thinkingBudget != null) {
```

---

## Build Commands

After making changes, rebuild the packages:

```bash
npm run build:packages
```

---

## Notes

- **Kimi K2 Thinking** handles reasoning internally via `reasoning_content` - there's no `thinking` toggle like Anthropic Claude.
- **Prompt caching** is NOT yet supported on Bedrock for Kimi (only Claude and Nova models).
- **topK** is not supported by Kimi's API.
- The `max_tokens` default is set to 16,384 to accommodate the model's reasoning chain + final output.

---

## References

- [AWS Bedrock Supported Models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html)
- [Moonshot Kimi K2 API Documentation](https://platform.moonshot.ai/docs/api/chat)
