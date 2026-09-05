<p align="center">
  <a href="https://librechat.ai">
    <img src="client/public/assets/logo.svg" height="256">
  </a>
  <h1 align="center">
    <a href="https://librechat.ai">LibreChat</a>
  </h1>
</p>

<p align="center">
  <strong>English</strong> ·
  <a href="README.zh.md">中文</a>
</p>

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
<a href="https://railway.com/deploy/librechat-official?referralCode=HI9hWz&utm_medium=integration&utm_source=readme&utm_campaign=librechat">
  <img src="https://railway.com/button.svg" alt="Deploy on Railway" height="30">
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

## 🚀 What's New in v0.8.8-rc2

- **Agent run control:** Interrupt an Agent before visible answer text, steer runs with files and quoted excerpts, durably queue follow-ups, and recover saved partial work with **Keep going** or **Answer now**.
- **Agent activity:** Optional generated labels group reasoning and tool work, fold completed groups into live phase cards, keep generated files visible, summarize multi-step phases, and show the current reasoning direction.
- **Human-in-the-loop Agents:** Stream up to four related questions, pause for input or tool approval, and resume durably.
- **Unified Agent Builder:** Configure Skills, MCP, Code Interpreter, orchestration, Programmatic Tool Calling, model-spec controls, and per-tool background and intent settings in one Tools marketplace; Skills can be enabled for standalone runtime authoring without exposing the existing catalog.
- **Durable Agent automation:** Authenticated Agent Events support bound child actors, expected-action receipts, per-actor mailboxes, event batching, durable human pauses, and automatic detached Actions across built-in stream stores.
- **Deeper Subagent history:** Browse branch-aware child turns with bounded reasoning and stable live event views, load earlier activity, inspect event details, continue completed child chats, and automatically wake saved parent Agents when detached work settles.
- **Background tools:** Eligible Code Interpreter, MCP, Plugin, and Action tools can run while an Agent keeps working, with automatic delivery for supported completions and polling controls when needed.
- **Code Interpreter workflows:** Sandbox images return as viewable artifacts; highly experimental stateful sessions add scoped managed, attached, or personal environments, per-message file downloads, and guarded file-write and command permissions.
- **Agent extensibility:** Experimental Agent Plugins bundle deployment Skills, MCP servers, and opt-in command hooks; saved Agent teams run as isolated Subagent graphs.
- **Scheduled Chats (experimental):** Run saved Agents with presets or custom cron, selectable time zones, multi-day weekly cadence, and optional Chat Project destinations.
- **Memory and context:** Agents can use optionally isolated memory, preserve adaptive context fading across turns, and show categorized current-window usage, tokens, and optional cost.
- **Editable long pastes:** Long pasted text becomes an editable attachment that can be moved back into the composer; attachment-only turns and reliable Upload as Text downloads are also supported.
- **Projects, settings, and navigation:** Search conversation titles and message contents, manage project chats, use searchable settings and shortcuts, pin chats, choose clock/week conventions, and navigate faster on mobile.
- **Sharing and artifacts:** Stable shared links support personal copies; fullscreen previews, Mermaid export, PowerPoint templates, shell scripts, and original Office downloads expand file workflows.
- **Web search:** Keenable adds keyless search and page fetch, while SearXNG and Tavily gain richer controls and all web-tool egress uses stronger SSRF protection.
- **Security and authentication:** Default HTTP security headers, opt-in nonce CSP, authenticated local images, per-user Code Interpreter JWTs, stable SAML identity binding, live-session OpenID token refresh, and retired JWT-secret rejection harden deployments.
- **Models and reasoning:** Added GPT-5.6 with Responses reasoning controls, Claude Fable 5.1, Opus 5, and Sonnet 5, plus Gemini 3.8/3.7/3.6 Flash and Gemini 3.5 Flash-Lite.
- **Langfuse observability:** Configure encrypted in-app connections, tenant fanout, authenticated gateways, export-decision telemetry, and authorized session links in chats and shared views.
- **Administration:** Source-aware content filters can audit or block model-bound data, while tenant Insights, delegated configuration, encrypted secrets, and expiring violation scores improve operations.
- **Streaming and reliability:** Adaptive smoothing, Redis delta batching and failover recovery, automatic generation protocol v2, live MCP catalog refresh, Agent circuit breakers, and DocumentDB support improve long runs and scaled deployments.

Read the [full v0.8.8-rc2 changelog](https://www.librechat.ai/changelog/v0.8.8-rc2).

# ✨ Features

- 🖥️ **UI & Experience** inspired by ChatGPT with enhanced design and features

- 🤖 **AI Model Selection**:  
  - Anthropic (Claude), AWS Bedrock, OpenAI, Azure OpenAI, Google, Vertex AI, OpenAI Responses API (incl. Azure)
  - [Custom Endpoints](https://www.librechat.ai/docs/quick_start/custom_endpoints): Use any OpenAI-compatible API with LibreChat, no proxy required
  - Compatible with [Local & Remote AI Providers](https://www.librechat.ai/docs/configuration/librechat_yaml/ai_endpoints):
    - Ollama, groq, Cohere, Mistral AI, Apple MLX, koboldcpp, together.ai,
    - OpenRouter, Helicone, The Grid, Perplexity, ShuttleAI, Deepseek, Qwen, and more

- 🔧 **[Code Interpreter API](https://www.librechat.ai/docs/features/code_interpreter)**: 
  - Secure, Sandboxed Execution in Python, Node.js (JS/TS), Go, C/C++, Java, PHP, Rust, and Fortran
  - Seamless File Handling: Upload, process, and download files directly
  - No Privacy Concerns: Fully isolated and secure execution
  - Open-Source & Self-Hostable: powered by [ClickHouse/code-interpreter](https://github.com/ClickHouse/code-interpreter)

- 🔦 **Agents & Tools Integration**:  
  - **[LibreChat Agents](https://www.librechat.ai/docs/features/agents)**:
    - No-Code Custom Assistants: Build specialized, AI-driven helpers
    - Agent Marketplace: Discover and deploy community-built agents
    - Collaborative Sharing: Share agents with specific users and groups
    - Flexible & Extensible: Use MCP Servers, tools, file search, code execution, and more
    - [Skills](https://www.librechat.ai/docs/features/skills): Create reusable `SKILL.md` instruction bundles for manual, automatic, or always-on agent workflows
    - [Agent Plugins](https://www.librechat.ai/docs/features/agent_plugins): Experimentally bundle deployment Skills and MCP servers into startup-loaded packages
    - [Subagents](https://www.librechat.ai/docs/features/subagents): Delegate focused work to isolated child agent runs with their own context windows
    - Compatible with Custom Endpoints, OpenAI, Azure, Anthropic, AWS Bedrock, Google, Vertex AI, Responses API, and more
    - [Model Context Protocol (MCP) Support](https://modelcontextprotocol.io/clients#librechat) for Tools

- 🔍 **Web Search**:  
  - Search the internet and retrieve relevant information to enhance your AI context
  - Combines search providers, content scrapers, and result rerankers for optimal results
  - **Customizable Jina Reranking**: Configure custom Jina API URLs for reranking services
  - **[Learn More →](https://www.librechat.ai/docs/features/web_search)**

- 🪄 **Generative UI with Code Artifacts**:  
  - [Code Artifacts](https://youtu.be/GfTj7O4gmd0?si=WJbdnemZpJzBrJo3) create React, HTML, and Mermaid content directly in chat
  - Open previews fullscreen and export Mermaid diagrams as SVG or PNG

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

- 🌊 **[Resumable Streams](https://www.librechat.ai/docs/features/resumable_streams)**:  
  - Never lose a response: AI responses automatically reconnect and resume if your connection drops
  - Multi-Tab & Multi-Device Sync: Open the same chat in multiple tabs or pick up on another device
  - Production-Ready: Works from single-server setups to horizontally scaled deployments with Redis

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

- 🎛️ **[Admin Panel](https://www.librechat.ai/docs/features/admin_panel)**:
  - Browser-based UI to manage users, groups, roles, and configuration overrides
  - Edit settings and per-role/group permissions live, without redeploying
  - Bundled with the Docker Compose stacks for one-command setup

- ⚙️ **Configuration & Deployment**:  
  - Configure Proxy, Reverse Proxy, Docker, & many Deployment options  
  - Use [S3 with CloudFront](https://www.librechat.ai/docs/configuration/cdn/cloudfront) for stable media links, edge delivery, signed cookies, and secured downloads
  - Use completely local or deploy on the cloud

- 📖 **Open-Source & Community**:  
  - Completely Open-Source & Built in Public  
  - Community-driven development, support, and feedback

[For a thorough review of our features, see our docs here](https://docs.librechat.ai/) 📚

## 🪶 All-In-One AI Conversations with LibreChat

LibreChat is a self-hosted AI chat platform that unifies all major AI providers in a single, privacy-focused interface.

Beyond chat, LibreChat provides AI Agents, Model Context Protocol (MCP) support, Artifacts, Code Interpreter, custom actions, conversation search, and enterprise-ready multi-user authentication.

Open source, actively developed, and built for anyone who values control over their AI infrastructure.

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
  <a href="https://www.star-history.com/?type=date&repos=danny-avila%2FLibreChat">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=danny-avila/LibreChat&type=date&theme=dark&legend=top-left&sealed_token=CXsk3L39t1nlibOv3pQloYwrz8R_yXxCAe1X3DG8sEnmu3PZvzSRZGf7JvisknF83yXqMwR6IcuKLolIQBulChAOseTYP1TDglfT6clOHXzspF-DJhmmsnGasrGpLfCeOEU56Bx761CJp9xDxza5rbyXW3F1GqWNtDf9pMroBq86vS70ilRWu16VyucF" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=danny-avila/LibreChat&type=date&legend=top-left&sealed_token=CXsk3L39t1nlibOv3pQloYwrz8R_yXxCAe1X3DG8sEnmu3PZvzSRZGf7JvisknF83yXqMwR6IcuKLolIQBulChAOseTYP1TDglfT6clOHXzspF-DJhmmsnGasrGpLfCeOEU56Bx761CJp9xDxza5rbyXW3F1GqWNtDf9pMroBq86vS70ilRWu16VyucF" />
      <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=danny-avila/LibreChat&type=date&legend=top-left&sealed_token=CXsk3L39t1nlibOv3pQloYwrz8R_yXxCAe1X3DG8sEnmu3PZvzSRZGf7JvisknF83yXqMwR6IcuKLolIQBulChAOseTYP1TDglfT6clOHXzspF-DJhmmsnGasrGpLfCeOEU56Bx761CJp9xDxza5rbyXW3F1GqWNtDf9pMroBq86vS70ilRWu16VyucF" />
    </picture>
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
