<!-- Last synced with README.md: 2026-05-12 (947bfa4c40) -->

<p align="center">
  <a href="https://librechat.ai">
    <img src="client/public/assets/logo.svg" height="256">
  </a>
  <h1 align="center">
    <a href="https://librechat.ai">LibreChat</a>
  </h1>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <strong>中文</strong>
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
      alt="翻译进度">
  </a>
</p>

## 🚀 v0.8.8-rc2 新增内容

- **智能体运行控制 (Agent run control)**：可在智能体输出可见回答文本前中断运行，借助文件与引用片段引导运行过程，将后续追问持久化排队，并通过 **Keep going（继续）** 或 **Answer now（立即回答）** 恢复已保存的部分结果。
- **智能体活动 (Agent activity)**：可选的自动生成标签会将推理过程与工具调用分组，已完成的分组会折叠为实时阶段卡片，生成的文件保持可见，多步骤阶段会被汇总，并展示当前的推理方向。
- **人工介入智能体 (Human-in-the-loop Agents)**：流式推送最多四个相关问题，可暂停等待用户输入或工具审批，并能持久恢复。
- **统一智能体构建器 (Unified Agent Builder)**：在同一个工具市场中配置 Skills、MCP、代码解释器、编排（orchestration）、程序化工具调用（Programmatic Tool Calling）、模型规格控制，以及各工具的后台与意图设置；Skills 可启用为独立运行时编写，而无需暴露现有目录。
- **持久化智能体自动化 (Durable Agent automation)**：经过认证的 Agent Events 支持绑定的子执行单元、预期操作回执、按执行单元划分的邮箱、事件批处理、持久化的人工暂停，以及跨内置流存储的自动分离 Actions。
- **更深入的子智能体历史 (Deeper Subagent history)**：浏览可感知分支的子轮次，具备有界推理与稳定的实时事件视图，可加载更早的活动、查看事件详情、继续已完成的子对话，并在分离任务结束时自动唤醒已保存的父智能体。
- **后台工具 (Background tools)**：符合条件的代码解释器、MCP、插件与 Action 工具可在智能体持续工作时于后台运行，支持的完成结果会自动投递，并在需要时提供轮询控制。
- **代码解释器工作流 (Code Interpreter workflows)**：沙箱镜像以可查看的制品形式返回；高度实验性的有状态会话新增了限定作用域的托管、挂载或个人环境，支持按消息下载文件，以及受保护的文件写入与命令权限。
- **智能体可扩展性 (Agent extensibility)**：实验性的 Agent Plugins 可将部署 Skills、MCP 服务器与可选启用的命令钩子打包；保存的智能体团队以隔离子智能体图的形式运行。
- **定时对话 (Scheduled Chats，实验性)**：使用预设或自定义 cron 运行已保存的智能体，支持可选时区、跨多天的每周周期，以及可选的对话项目（Chat Project）目标位置。
- **记忆与上下文 (Memory and context)**：智能体可使用可选的隔离记忆，在多轮之间保留自适应上下文衰减，并分类展示当前窗口用量、token 与可选的费用。
- **可编辑的长文本粘贴 (Editable long pastes)**：长文本粘贴会转为可编辑的附件，并可移回输入框；同时支持仅含附件的轮次，以及更可靠的「以文本上传」下载。
- **项目、设置与导航 (Projects, settings, and navigation)**：搜索对话标题与消息内容，管理项目对话，使用可搜索的设置与快捷键，置顶对话，选择时钟/周起始惯例，并在移动端更快地导航。
- **共享与制品 (Sharing and artifacts)**：稳定的共享链接支持个人副本；全屏预览、Mermaid 导出、PowerPoint 模板、shell 脚本与原始 Office 文件下载拓展了文件工作流。
- **网页搜索 (Web search)**：Keenable 提供无需密钥的搜索与页面抓取，SearXNG 与 Tavily 增加了更丰富的控制选项，且所有网页工具的出站请求均采用更强的 SSRF 防护。
- **安全与认证 (Security and authentication)**：默认 HTTP 安全响应头、可选启用的 nonce CSP、需认证的本地图片、按用户签发的代码解释器 JWT、稳定的 SAML 身份绑定、会话期间的 OpenID token 刷新，以及拒绝已退役的 JWT 密钥，共同加固部署安全。
- **模型与推理 (Models and reasoning)**：新增 GPT-5.6（含 Responses 推理控制）、Claude Fable 5.1、Opus 5 与 Sonnet 5，以及 Gemini 3.8/3.7/3.6 Flash 和 Gemini 3.5 Flash-Lite。
- **Langfuse 可观测性 (Langfuse observability)**：可配置加密的应用内连接、租户扇出、需认证的网关、导出决策遥测，以及对话与共享视图中经过授权的会话链接。
- **管理 (Administration)**：可感知来源的内容过滤器能够审计或阻断绑定到模型的数据；租户 Insights、委派式配置、加密密钥与会自动过期的违规评分则改善了运维。
- **流式传输与可靠性 (Streaming and reliability)**：自适应平滑、Redis 增量批处理与故障转移恢复、自动生成协议 v2、实时 MCP 目录刷新、智能体熔断器，以及 DocumentDB 支持，共同改善长时间运行与规模化部署。

阅读[完整的 v0.8.8-rc2 更新日志](https://www.librechat.ai/changelog/v0.8.8-rc2)。

# ✨ 功能

- 🖥️ **UI 与体验**：受 ChatGPT 启发，并具备更强的设计与功能。

- 🤖 **AI 模型选择**：  
  - Anthropic (Claude), AWS Bedrock, OpenAI, Azure OpenAI, Google, Vertex AI, OpenAI Responses API (包含 Azure)
  - [自定义端点 (Custom Endpoints)](https://www.librechat.ai/docs/quick_start/custom_endpoints)：LibreChat 支持任何兼容 OpenAI 规范的 API，无需代理。
  - 兼容[本地与远程 AI 服务商](https://www.librechat.ai/docs/configuration/librechat_yaml/ai_endpoints)：
    - Ollama, [AMD Lemonade](https://lemonade-server.ai/), groq, Cohere, Mistral AI, Apple MLX, koboldcpp, together.ai,
    - OpenRouter, Helicone, Perplexity, ShuttleAI, Deepseek, Qwen 等。

- 🔧 **[代码解释器 (Code Interpreter) API](https://www.librechat.ai/docs/features/code_interpreter)**： 
  - 安全的沙箱执行环境，支持 Python, Node.js (JS/TS), Go, C/C++, Java, PHP, Rust 和 Fortran。
  - 无缝文件处理：直接上传、处理并下载文件。
  - 隐私无忧：完全隔离且安全的执行环境。
  - 开源且可自托管：由 [ClickHouse/code-interpreter](https://github.com/ClickHouse/code-interpreter) 提供支持。

- 🔦 **智能体与工具集成**：  
  - **[LibreChat 智能体 (Agents)](https://www.librechat.ai/docs/features/agents)**：
    - 无代码定制助手：无需编程即可构建专业化的 AI 驱动助手。
    - 智能体市场：发现并部署社区构建的智能体。
    - 协作共享：与特定用户和群组共享智能体。
    - 灵活且可扩展：支持 MCP 服务器、工具、文件搜索、代码执行等。
    - [Skills](https://www.librechat.ai/docs/features/skills)：创建可复用的 `SKILL.md` 指令包，用于手动、自动或始终启用的智能体工作流。
    - [Agent Plugins](https://www.librechat.ai/docs/features/agent_plugins)：实验性功能，可将部署 Skills 与 MCP 服务器打包为启动即加载的插件包。
    - [Subagents](https://www.librechat.ai/docs/features/subagents)：将专门任务委派给拥有独立上下文窗口的隔离子智能体运行。
    - 兼容自定义端点、OpenAI, Azure, Anthropic, AWS Bedrock, Google, Vertex AI, Responses API 等。
    - [支持模型上下文协议 (MCP)](https://modelcontextprotocol.io/clients#librechat) 用于工具调用。

- 🔍 **网页搜索**：  
  - 搜索互联网并检索相关信息以增强 AI 上下文。
  - 结合搜索提供商、内容爬虫和结果重排序，确保最佳检索效果。
  - **可定制 Jina 重排序**：配置自定义 Jina API URL 用于重排序服务。
  - **[了解更多 →](https://www.librechat.ai/docs/features/web_search)**

- 🪄 **支持代码 Artifacts 的生成式 UI**：  
  - [代码 Artifacts](https://youtu.be/GfTj7O4gmd0?si=WJbdnemZpJzBrJo3) 允许在对话中直接创建 React 组件、HTML 页面和 Mermaid 图表。

- 🎨 **图像生成与编辑**：
  - 使用 [GPT-Image-1](https://www.librechat.ai/docs/features/image_gen#1--openai-image-tools-recommended) 进行文生图与图生图。
  - 支持 [DALL-E (3/2)](https://www.librechat.ai/docs/features/image_gen#2--dalle-legacy), [Stable Diffusion](https://www.librechat.ai/docs/features/image_gen#3--stable-diffusion-local), [Flux](https://www.librechat.ai/docs/features/image_gen#4--flux) 或任何 [MCP 服务器](https://www.librechat.ai/docs/features/image_gen#5--model-context-protocol-mcp)。
  - 根据提示词生成惊艳的视觉效果，或通过指令精修现有图像。

- 💾 **预设与上下文管理**：  
  - 创建、保存并分享自定义预设。
  - 在对话中随时切换 AI 端点和预设。
  - 编辑、重新提交并通过对话分支继续消息。
  - 创建并与特定用户和群组共享提示词。
  - [消息与对话分叉 (Fork)](https://www.librechat.ai/docs/features/fork) 以实现高级上下文控制。

- 💬 **多模态与文件交互**：  
  - 使用 Claude 3, GPT-4.5, GPT-4o, o1, Llama-Vision 和 Gemini 上传并分析图像 📸。  
  - 支持通过自定义端点、OpenAI, Azure, Anthropic, AWS Bedrock 和 Google 进行文件对话 🗃️。

- 🌎 **多语言 UI**：
  - English, 中文 (简体), 中文 (繁體), العربية, Deutsch, Español, Français, Italiano
  - Polski, Português (PT), Português (BR), Русский, 日本語, Svenska, 한국어, Tiếng Việt
  - Türkçe, Nederlands, עברית, Català, Čeština, Dansk, Eesti, فارسی
  - Suomi, Magyar, Հայերեն, Bahasa Indonesia, ქართული, Latviešu, ไทย, ئۇيغۇرچە

- 🧠 **推理 UI**：  
  - 针对 DeepSeek-R1 等思维链/推理 AI 模型的动态推理 UI。

- 🎨 **可定制界面**：  
  - 可定制的下拉菜单和界面，同时适配高级用户和初学者。

- 🌊 **[可恢复流 (Resumable Streams)](https://www.librechat.ai/docs/features/resumable_streams)**：
  - 永不丢失响应：AI 响应在连接中断后自动重连并继续。
  - 多标签页与多设备同步：在多个标签页打开同一对话，或在另一设备上继续。
  - 生产级可靠性：支持从单机部署到基于 Redis 的水平扩展。

- 🗣️ **语音与音频**：  
  - 通过语音转文字和文字转语音实现免提对话。  
  - 自动发送并播放音频。  
  - 支持 OpenAI, Azure OpenAI 和 Elevenlabs。

- 📥 **导入与导出对话**：  
  - 从 LibreChat, ChatGPT, Chatbot UI 导入对话。  
  - 将对话导出为截图、Markdown、文本、JSON。

- 🔍 **搜索与发现**：  
  - 搜索所有消息和对话。

- 👥 **多用户与安全访问**：
  - 支持 OAuth2, LDAP 和电子邮件登录的多用户安全认证。
  - 内置审核系统和 Token 消耗管理工具。

- 🎛️ **[管理面板 (Admin Panel)](https://www.librechat.ai/docs/features/admin_panel)**：
  - 基于浏览器的界面，用于管理用户、群组、角色与配置覆盖。
  - 实时编辑设置与按角色/群组的权限，无需重新部署。
  - 内置于 Docker Compose 堆栈，一条命令即可完成部署。

- ⚙️ **配置与部署**：  
  - 支持代理、反向代理、Docker 及多种部署选项。  
  - 使用 [S3 与 CloudFront](https://www.librechat.ai/docs/configuration/cdn/cloudfront) 获得稳定的媒体链接、边缘分发、签名 Cookie 和安全下载。
  - 可完全本地运行或部署在云端。

- 📖 **开源与社区**：  
  - 完全开源且在公众监督下开发。  
  - 社区驱动的开发、支持与反馈。

[查看我们的文档了解更多功能详情](https://docs.librechat.ai/) 📚

## 🪶 LibreChat：全方位的 AI 对话平台

LibreChat 是一个自托管的 AI 对话平台，在一个注重隐私的统一界面中整合了所有主流 AI 服务商。

除了对话功能外，LibreChat 还提供 AI 智能体、模型上下文协议 (MCP) 支持、Artifacts、代码解释器、自定义操作、对话搜索，以及企业级多用户认证。

开源、活跃开发中，专为重视 AI 基础设施自主可控的用户而构建。

---

## 🌐 资源

**GitHub 仓库：**
  - **RAG API:** [github.com/danny-avila/rag_api](https://github.com/danny-avila/rag_api)
  - **网站:** [github.com/LibreChat-AI/librechat.ai](https://github.com/LibreChat-AI/librechat.ai)

**其他：**
  - **官方网站:** [librechat.ai](https://librechat.ai)
  - **帮助文档:** [librechat.ai/docs](https://librechat.ai/docs)
  - **博客:** [librechat.ai/blog](https://librechat.ai/blog)

---

## 📝 更新日志

访问发布页面和更新日志以了解最新动态：
- [发布页面 (Releases)](https://github.com/danny-avila/LibreChat/releases)
- [更新日志 (Changelog)](https://www.librechat.ai/changelog)

**⚠️ 在更新前请务必查看[更新日志](https://www.librechat.ai/changelog)以了解破坏性更改。**

---

## ⭐ Star 历史

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
    <img style="width: 260px; height: 56px" src="https://runacap.com/wp-content/uploads/2024/04/ROSS_badge_white_Q1_2024.svg" alt="ROSS Index - 2024年第一季度增长最快的开源初创公司 | Runa Capital" width="260" height="56"/>
  </a>
</p>

---

## ✨ 贡献

欢迎任何形式的贡献、建议、错误报告和修复！

对于新功能、组件或扩展，请在发送 PR 前开启 issue 进行讨论。

如果您想帮助我们将 LibreChat 翻译成您的母语，我们非常欢迎！改进翻译不仅能让全球用户更轻松地使用 LibreChat，还能提升整体用户体验。请查看我们的[翻译指南](https://www.librechat.ai/docs/translation)。

---

## 💖 感谢所有贡献者

<a href="https://github.com/danny-avila/LibreChat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=danny-avila/LibreChat" />
</a>

---

## 🎉 特别鸣谢

感谢 [Locize](https://locize.com) 提供的翻译管理工具，支持 LibreChat 的多语言功能。

<p align="center">
  <a href="https://locize.com" target="_blank" rel="noopener noreferrer">
    <img src="https://github.com/user-attachments/assets/d6b70894-6064-475e-bb65-92a9e23e0077" alt="Locize Logo" height="50">
  </a>
</p>
