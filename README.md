<p align="center">
  <a href="https://librechat.ai">
    <img src="client/public/assets/logo.svg" height="256">
  </a>
  <h1 align="center">
    <a href="https://librechat.ai">LibreChat</a>
  </h1>
</p>

> **🚀 This Fork Features Native OpenRouter Support**
>
> This fork includes full native integration for [OpenRouter](https://openrouter.ai), providing access to 100+ AI models through a single API with enterprise features:
> - ✅ **Full Agent System Compatibility** - Unlike YAML config, works seamlessly with LibreChat Agents
> - ✅ **Automatic Model Fallbacks** - Define backup models for reliability
> - ✅ **Smart Routing** - Auto Router intelligently selects the best model
> - ✅ **Real-time Credits Tracking** - Monitor usage directly in the UI
> - ✅ **Provider Preferences** - Control which providers to use
>
> **[📖 OpenRouter Documentation](docs/features/providers/openrouter.md)** | **[🚀 Quick Start](docs/features/providers/openrouter.md#quick-start)** | **[⚙️ API Reference](docs/api-reference/openrouter.md)**

<p align="center">
  <a href="https://discord.librechat.ai"> 
    <img
      src="https://img.shields.io/discord/1086345563026489514?label=&logo=discord&style=for-the-badge&logoWidth=20&logoColor=white&labelColor=000000&color=blueviolet">
  </a>
  <a href="https://www.youtube.com/@LibreChat"> 
    <img
      src="https://img.shields.io/badge/YOUTUBE-red.svg?style=for-the-badge&logo=youtube&logoColor=white&labelColor=000000&logoWidth=20">
  </a>
  <a href="https://docs.librechat.ai"> 
    <img
      src="https://img.shields.io/badge/DOCS-blue.svg?style=for-the-badge&logo=read-the-docs&logoColor=white&labelColor=000000&logoWidth=20">
  </a>
  <a aria-label="Sponsors" href="https://github.com/sponsors/danny-avila">
    <img
      src="https://img.shields.io/badge/SPONSORS-brightgreen.svg?style=for-the-badge&logo=github-sponsors&logoColor=white&labelColor=000000&logoWidth=20">
  </a>
</p>

<p align="center">
<a href="https://railway.app/template/b5k2mn?referralCode=HI9hWz">
  <img src="https://railway.app/button.svg" alt="Deploy on Railway" height="30">
</a>
<a href="https://zeabur.com/templates/0X2ZY8">
  <img src="https://zeabur.com/button.svg" alt="Deploy on Zeabur" height="30"/>
</a>
<a href="https://template.cloud.sealos.io/deploy?templateName=librechat">
  <img src="https://raw.githubusercontent.com/labring-actions/templates/main/Deploy-on-Sealos.svg" alt="Deploy on Sealos" height="30">
</a>
</p>

<p align="center">
  <a href="https://www.librechat.ai/docs/translation">
    <img 
      src="https://img.shields.io/badge/dynamic/json.svg?style=for-the-badge&color=2096F3&label=locize&query=%24.translatedPercentage&url=https://api.locize.app/badgedata/4cb2598b-ed4d-469c-9b04-2ed531a8cb45&suffix=%+translated" 
      alt="Translation Progress">
  </a>
</p>


# ✨ Features

- 🖥️ **UI & Experience** inspired by ChatGPT with enhanced design and features

- 🤖 **AI Model Selection**:
  - Anthropic (Claude), AWS Bedrock, OpenAI, Azure OpenAI, Google, Vertex AI, OpenAI Responses API (incl. Azure)
  - **OpenRouter Native Integration**: Access 100+ models with automatic fallbacks, smart routing, and credits tracking
  - [Custom Endpoints](https://www.librechat.ai/docs/quick_start/custom_endpoints): Use any OpenAI-compatible API with LibreChat, no proxy required
  - Compatible with [Local & Remote AI Providers](https://www.librechat.ai/docs/configuration/librechat_yaml/ai_endpoints):
    - Ollama, groq, Cohere, Mistral AI, Apple MLX, koboldcpp, together.ai,
    - Perplexity, ShuttleAI, Deepseek, Qwen, and more

- 🔧 **[Code Interpreter API](https://www.librechat.ai/docs/features/code_interpreter)**: 
  - Secure, Sandboxed Execution in Python, Node.js (JS/TS), Go, C/C++, Java, PHP, Rust, and Fortran
  - Seamless File Handling: Upload, process, and download files directly
  - No Privacy Concerns: Fully isolated and secure execution

- 🔦 **Agents & Tools Integration**:  
  - **[LibreChat Agents](https://www.librechat.ai/docs/features/agents)**:
    - No-Code Custom Assistants: Build specialized, AI-driven helpers
    - Agent Marketplace: Discover and deploy community-built agents
    - Collaborative Sharing: Share agents with specific users and groups
    - Flexible & Extensible: Use MCP Servers, tools, file search, code execution, and more
    - Compatible with Custom Endpoints, OpenAI, Azure, Anthropic, AWS Bedrock, Google, Vertex AI, Responses API, and more
    - [Model Context Protocol (MCP) Support](https://modelcontextprotocol.io/clients#librechat) for Tools

- 🔍 **Web Search**:  
  - Search the internet and retrieve relevant information to enhance your AI context
  - Combines search providers, content scrapers, and result rerankers for optimal results
  - **Customizable Jina Reranking**: Configure custom Jina API URLs for reranking services
  - **[Learn More →](https://www.librechat.ai/docs/features/web_search)**

- 🪄 **Generative UI with Code Artifacts**:  
  - [Code Artifacts](https://youtu.be/GfTj7O4gmd0?si=WJbdnemZpJzBrJo3) allow creation of React, HTML, and Mermaid diagrams directly in chat

- 🎨 **Image Generation & Editing**
  - Text-to-image and image-to-image with [GPT-Image-1](https://www.librechat.ai/docs/features/image_gen#1--openai-image-tools-recommended)
  - Text-to-image with [DALL-E (3/2)](https://www.librechat.ai/docs/features/image_gen#2--dalle-legacy), [Stable Diffusion](https://www.librechat.ai/docs/features/image_gen#3--stable-diffusion-local), [Flux](https://www.librechat.ai/docs/features/image_gen#4--flux), or any [MCP server](https://www.librechat.ai/docs/features/image_gen#5--model-context-protocol-mcp)
  - Produce stunning visuals from prompts or refine existing images with a single instruction

- 💾 **Presets & Context Management**:  
  - Create, Save, & Share Custom Presets  
  - Switch between AI Endpoints and Presets mid-chat
  - Edit, Resubmit, and Continue Messages with Conversation branching  
  - Create and share prompts with specific users and groups
  - [Fork Messages & Conversations](https://www.librechat.ai/docs/features/fork) for Advanced Context control

- 💬 **Multimodal & File Interactions**:  
  - Upload and analyze images with Claude 3, GPT-4.5, GPT-4o, o1, Llama-Vision, and Gemini 📸  
  - Chat with Files using Custom Endpoints, OpenAI, Azure, Anthropic, AWS Bedrock, & Google 🗃️

- 🌎 **Multilingual UI**:
  - English, 中文 (简体), 中文 (繁體), العربية, Deutsch, Español, Français, Italiano
  - Polski, Português (PT), Português (BR), Русский, 日本語, Svenska, 한국어, Tiếng Việt
  - Türkçe, Nederlands, עברית, Català, Čeština, Dansk, Eesti, فارسی
  - Suomi, Magyar, Հայերեն, Bahasa Indonesia, ქართული, Latviešu, ไทย, ئۇيغۇرچە

- 🧠 **Reasoning UI**:  
  - Dynamic Reasoning UI for Chain-of-Thought/Reasoning AI models like DeepSeek-R1

- 🎨 **Customizable Interface**:  
  - Customizable Dropdown & Interface that adapts to both power users and newcomers

- 🗣️ **Speech & Audio**:  
  - Chat hands-free with Speech-to-Text and Text-to-Speech  
  - Automatically send and play Audio  
  - Supports OpenAI, Azure OpenAI, and Elevenlabs

- 📥 **Import & Export Conversations**:  
  - Import Conversations from LibreChat, ChatGPT, Chatbot UI  
  - Export conversations as screenshots, markdown, text, json

- 🔍 **Search & Discovery**:  
  - Search all messages/conversations

- 👥 **Multi-User & Secure Access**:
  - Multi-User, Secure Authentication with OAuth2, LDAP, & Email Login Support
  - Built-in Moderation, and Token spend tools

- ⚙️ **Configuration & Deployment**:  
  - Configure Proxy, Reverse Proxy, Docker, & many Deployment options  
  - Use completely local or deploy on the cloud

- 📖 **Open-Source & Community**:  
  - Completely Open-Source & Built in Public  
  - Community-driven development, support, and feedback

[For a thorough review of our features, see our docs here](https://docs.librechat.ai/) 📚

## 🚀 OpenRouter Native Integration

> **⚠️ Note: This is a proof-of-concept implementation**. While OpenRouter is now integrated as a native provider with Agent system compatibility, comprehensive testing is still ongoing.
>
> **This fork with native OpenRouter integration was developed by Sergey Kornilov (Biostochastics)**

### Motivation

The existing YAML configuration approach for OpenRouter (as documented in [Issue #6763](https://github.com/danny-avila/LibreChat/issues/6763)) had a critical limitation: it was incompatible with LibreChat's Agent system. Since LibreChat routes all conversations through its agent infrastructure—not just agent-specific features—this incompatibility meant missing out on core functionality. Native provider status was necessary to enable full feature parity with other providers.

### Implementation Details

#### The Core Problem
LibreChat's architecture uses the agent system (`@librechat/agents` package) for all chat interactions. The package includes a `ChatOpenRouter` class that extends `ChatOpenAI` from langchain, but getting it to work required understanding the exact configuration structure it expected.

#### Specific Changes Made

**1. Configuration Structure Matching**
The `ChatOpenRouter` class required a specific nested structure that wasn't obvious from the documentation:
```javascript
// What ChatOpenRouter actually expects:
{
  apiKey: 'sk-or-...',
  configuration: {  // Must be nested exactly like this
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3080',
      'X-Title': 'LibreChat'
    }
  }
}
```
Initial attempts placed `baseURL` at the root level or used different nesting, causing all requests to route to OpenAI's API instead.

**2. Provider Registration and Mapping**
- Modified `/api/server/services/Endpoints/index.js` to map OpenRouter to its own initialization function (`initOpenRouter`) rather than the generic `initCustom`
- Added multiple mapping entries to handle case variations and different property names used throughout the codebase

**3. Initialization Flow (`/api/server/services/Endpoints/openrouter/initialize.js`)**
- When `optionsOnly=true` (agent mode), returns configuration formatted for `ChatOpenRouter`
- When `optionsOnly=false` (direct client mode), instantiates `OpenRouterClient` for non-agent operations
- Handles both user-provided and environment-configured API keys

**4. Frontend Registry Fix**
The frontend was throwing `TypeError: undefined is not an object (evaluating 'e.key')` because OpenRouter wasn't registered in `/client/src/components/Endpoints/Settings/settings.ts`. Added the registration to fix the undefined reference.

**5. Credits Tracking and Auto Router Toggle Feature**
- Implemented `/api/endpoints/openrouter/credits` endpoint
- Added caching layer (5-minute TTL) to avoid excessive API calls
- Created unified control bar with credits display and Auto Router toggle
- **Auto Router Toggle Implementation**:
  - Toggle positioned next to credits for prominent visibility
  - When enabled, automatically sets model to `openrouter/auto`
  - Disables model dropdown with clear "Auto Router Active" message
  - State persists via Recoil atom with localStorage
  - Visual feedback with green lightning icon when active
  - Responsive design - compact on mobile, full on desktop

### Auto Router Toggle Technical Implementation

**Files Modified for Auto Router Feature:**
1. `/client/src/components/Nav/OpenRouterCredits.tsx`
   - Extended to include Auto Router toggle alongside credits
   - Added Switch component with Zap icon for visual feedback
   - Implemented responsive layout with divider separator

2. `/client/src/components/Input/ModelSelect/OpenRouter.tsx`
   - Added conditional rendering based on `openRouterAutoRouterEnabledState`
   - When enabled, displays disabled state with "Auto Router Active" message
   - Prevents manual model selection when Auto Router is active

3. `/client/src/store/openrouter.ts`
   - Already contained `openRouterAutoRouterEnabledState` atom with localStorage persistence
   - `openRouterConfigSelector` automatically sets model to `openrouter/auto` when enabled

4. `/client/src/locales/en/translation.json`
   - Added localization keys for Auto Router UI elements
   - Includes toggle label, tooltip, and disabled state messages

### Caveats and Issues Encountered

1. **API Routing Confusion**: The most time-consuming issue was requests being sent to `https://api.openai.com` instead of `https://openrouter.ai/api/v1`. This happened because the configuration structure wasn't matching what `ChatOpenAI` (parent class) expected.

2. **Multiple Provider Names**: OpenRouter is referenced differently across the codebase (`openrouter`, `OPENROUTER`, `EModelEndpoint.openrouter`), requiring multiple mapping entries.

3. **Agent System Dependency**: Initially attempted to make OpenRouter work independently of the agent system, but discovered this was architecturally impossible given LibreChat's design.

4. **Debugging Challenges**: The actual configuration being passed to `ChatOpenRouter` wasn't logged by default, making it difficult to identify the structure mismatch. Added extensive logging to trace the configuration flow.

### Current Features
- **✅ Full Agent Compatibility**: Required for any chat functionality in LibreChat
- **✅ Credits Tracking**: Real-time balance monitoring with intelligent caching
- **✅ Model Selection**: Access to 100+ models through OpenRouter's unified API
- **✅ Proper API Routing**: Requests correctly sent to OpenRouter's endpoints
- **✅ Environment Configuration**: Support for API keys and site attribution headers

### Quick Setup
1. Get your API key from [OpenRouter](https://openrouter.ai/keys)
2. Add to your `.env` file:
   ```bash
   OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxx
   OPENROUTER_SITE_URL=http://localhost:3080  # Optional
   OPENROUTER_SITE_NAME=LibreChat             # Optional
   ```
3. Select OpenRouter from the provider dropdown in LibreChat
4. Choose from 100+ available models or use Auto Router for intelligent model selection

### Production Readiness Checklist
- [x] Core functionality (chat, agents, credits)
- [x] Proper API routing and authentication
- [x] Basic caching implementation
- [ ] Comprehensive error handling
- [ ] Unit and integration tests
- [ ] Rate limiting implementation
- [ ] Complete API documentation
- [ ] Migration guide from YAML config

[Learn more about the implementation →](docs/configuration/providers/openrouter.md)

## 🪶 All-In-One AI Conversations with LibreChat

LibreChat brings together the future of assistant AIs with the revolutionary technology of OpenAI's ChatGPT. Celebrating the original styling, LibreChat gives you the ability to integrate multiple AI models. It also integrates and enhances original client features such as conversation and message search, prompt templates and plugins.

With LibreChat, you no longer need to opt for ChatGPT Plus and can instead use free or pay-per-call APIs. We welcome contributions, cloning, and forking to enhance the capabilities of this advanced chatbot platform.

[![Watch the video](https://raw.githubusercontent.com/LibreChat-AI/librechat.ai/main/public/images/changelog/v0.7.6.gif)](https://www.youtube.com/watch?v=ilfwGQtJNlI)

Click on the thumbnail to open the video☝️

---

## 🌐 Resources

**GitHub Repo:**
  - **RAG API:** [github.com/danny-avila/rag_api](https://github.com/danny-avila/rag_api)
  - **Website:** [github.com/LibreChat-AI/librechat.ai](https://github.com/LibreChat-AI/librechat.ai)

**Other:**
  - **Website:** [librechat.ai](https://librechat.ai)
  - **Documentation:** [librechat.ai/docs](https://librechat.ai/docs)
  - **Blog:** [librechat.ai/blog](https://librechat.ai/blog)

---

## 📝 Changelog

Keep up with the latest updates by visiting the releases page and notes:
- [Releases](https://github.com/danny-avila/LibreChat/releases)
- [Changelog](https://www.librechat.ai/changelog) 

**⚠️ Please consult the [changelog](https://www.librechat.ai/changelog) for breaking changes before updating.**

---

## ⭐ Star History

<p align="center">
  <a href="https://star-history.com/#danny-avila/LibreChat&Date">
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=danny-avila/LibreChat&type=Date&theme=dark" onerror="this.src='https://api.star-history.com/svg?repos=danny-avila/LibreChat&type=Date'" />
  </a>
</p>
<p align="center">
  <a href="https://trendshift.io/repositories/4685" target="_blank" style="padding: 10px;">
    <img src="https://trendshift.io/api/badge/repositories/4685" alt="danny-avila%2FLibreChat | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/>
  </a>
  <a href="https://runacap.com/ross-index/q1-24/" target="_blank" rel="noopener" style="margin-left: 20px;">
    <img style="width: 260px; height: 56px" src="https://runacap.com/wp-content/uploads/2024/04/ROSS_badge_white_Q1_2024.svg" alt="ROSS Index - Fastest Growing Open-Source Startups in Q1 2024 | Runa Capital" width="260" height="56"/>
  </a>
</p>

---

## ✨ Contributions

Contributions, suggestions, bug reports and fixes are welcome!

For new features, components, or extensions, please open an issue and discuss before sending a PR.

If you'd like to help translate LibreChat into your language, we'd love your contribution! Improving our translations not only makes LibreChat more accessible to users around the world but also enhances the overall user experience. Please check out our [Translation Guide](https://www.librechat.ai/docs/translation).

---

## 💖 This project exists in its current state thanks to all the people who contribute

<a href="https://github.com/danny-avila/LibreChat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=danny-avila/LibreChat" />
</a>

---

## 🎉 Special Thanks

We thank [Locize](https://locize.com) for their translation management tools that support multiple languages in LibreChat.

<p align="center">
  <a href="https://locize.com" target="_blank" rel="noopener noreferrer">
    <img src="https://github.com/user-attachments/assets/d6b70894-6064-475e-bb65-92a9e23e0077" alt="Locize Logo" height="50">
  </a>
</p>

---

## 🚀 Fork Attribution

**This fork featuring native OpenRouter integration was developed by:**

### Sergey Kornilov (Biostochastics)
- GitHub: [@biostochastics](https://github.com/biostochastics)
- Implementation of native OpenRouter provider support
- Full Agent system compatibility for OpenRouter
- Real-time credits tracking integration
- Auto Router toggle and fallback chain management

The OpenRouter native integration enables access to 100+ AI models through a single API with enterprise features, solving the limitation where YAML configuration was incompatible with LibreChat's Agent system.
