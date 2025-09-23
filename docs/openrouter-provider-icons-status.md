# OpenRouter Provider Icons Status

## Total Providers: 52

### ✅ Already Have Icons (10)
- `google` - GoogleMinimalIcon component
- `anthropic` - AnthropicIcon component
- `openai` - OpenAIMinimalIcon component
- `microsoft` - AzureMinimalIcon component
- `mistralai` - /assets/mistral.png
- `cohere` - /assets/cohere.png
- `perplexity` - /assets/perplexity.png
- `meta-llama` - Letter icon "Ll" (blue gradient)
- `x-ai` - Letter icon "X" (gray gradient)
- `nvidia` - Letter icon "N" (green gradient)

### ❌ Missing Icons - Need to Add (42)

#### Chinese AI Companies
- `alibaba` - Alibaba Cloud (Qwen models)
- `baidu` - Baidu (ERNIE models)
- `bytedance` - ByteDance (Doubao models)
- `deepseek` - DeepSeek
- `meituan` - Meituan
- `minimax` - MiniMax
- `moonshotai` - Moonshot AI (Kimi)
- `qwen` - Qwen (Alibaba)
- `stepfun-ai` - StepFun
- `tencent` - Tencent (Hunyuan)
- `thudm` - Tsinghua University (ChatGLM)
- `zhipu` - Zhipu AI

#### Research & Academic
- `allenai` - Allen Institute for AI
- `eleutherai` - EleutherAI
- `inception` - Inception
- `opengvlab` - OpenGVLab
- `shisa-ai` - Shisa AI

#### Commercial AI Companies
- `ai21` - AI21 Labs (Jamba)
- `amazon` - Amazon (Titan)
- `arcee-ai` - Arcee AI
- `arliai` - ARL AI
- `deepcogito` - DeepCogito
- `inflection` - Inflection AI
- `liquid` - Liquid AI

#### Community & Open Source
- `agentica-org` - Agentica
- `aion-labs` - AION Labs
- `alfredpros` - AlfredPros
- `alpindale` - Alpindale
- `anthracite-org` - Anthracite
- `cognitivecomputations` - Cognitive Computations
- `gryphe` - Gryphe (MythoMax)
- `mancer` - Mancer
- `morph` - Morph
- `neversleep` - NeverSleep
- `nousresearch` - NousResearch (Hermes)
- `raifle` - Raifle
- `sao10k` - Sao10K
- `switchpoint` - SwitchPoint
- `thedrummer` - TheDrummer
- `tngtech` - TNG Technology
- `undi95` - Undi95
- `z-ai` - Z-AI

### Special Cases
- `openrouter` - OpenRouter's own models (Auto-Router)

## Icon Implementation Strategy

### Priority 1 - Major Providers (Need Real Icons)
1. **Amazon** - AWS Bedrock/Titan models
2. **AI21** - Jamba models
3. **DeepSeek** - Popular Chinese models
4. **Alibaba/Qwen** - Major Chinese provider
5. **ByteDance** - Doubao models
6. **EleutherAI** - Open source research

### Priority 2 - Use Letter Icons with Unique Colors
For the remaining providers, we'll use stylized letter icons with unique color gradients:

```javascript
// Example additions needed:
'amazon': <ProviderLetterIcon letter="A" color="bg-gradient-to-br from-orange-500 to-orange-700" />,
'ai21': <ProviderLetterIcon letter="A" color="bg-gradient-to-br from-cyan-500 to-cyan-600" />,
'bytedance': <ProviderLetterIcon letter="B" color="bg-gradient-to-br from-red-500 to-pink-600" />,
'baidu': <ProviderLetterIcon letter="B" color="bg-gradient-to-br from-blue-600 to-blue-800" />,
'eleutherai': <ProviderLetterIcon letter="E" color="bg-gradient-to-br from-purple-500 to-purple-700" />,
'allenai': <ProviderLetterIcon letter="A" color="bg-gradient-to-br from-green-500 to-green-700" />,
'moonshot': <ProviderLetterIcon letter="M" color="bg-gradient-to-br from-indigo-400 to-purple-600" />,
'tencent': <ProviderLetterIcon letter="T" color="bg-gradient-to-br from-blue-500 to-green-500" />,
// ... and so on
```

## Files to Download (If Available)

### High Priority - Recognizable Logos
1. **Amazon/AWS** - Orange smile/arrow logo
2. **ByteDance** - Musical note logo
3. **Baidu** - Paw print logo
4. **Alibaba** - Orange "A" logo
5. **Tencent** - Penguin or "T" logo
6. **EleutherAI** - Has a distinctive logo

### Sources for Icons
- Official company websites
- GitHub organization profiles
- Brand resource centers
- Wikipedia (for public domain versions)
- Icon libraries (SimpleIcons, DevIcons)

## Implementation Notes

1. Most community/individual providers don't have official logos
2. Letter icons with unique gradients work well for differentiation
3. Some providers may prefer not to have their logos used
4. Consider adding a fallback system for unknown providers
5. The emoji approach (like 🤗 for Hugging Face) could work for some

## Next Steps

1. Add all missing providers to the `openRouterProviderIcons` mapping
2. Download available official logos (symbol-only versions)
3. Create consistent letter icons for providers without logos
4. Test with various OpenRouter models
5. Add configuration option to disable provider icons if needed