<p align="center">
  <a href="https://docs.librechat.ai">
    <img src="docs/assets/LibreChat.svg" height="256">
  </a>
  <a href="https://docs.librechat.ai">
    <h1 align="center">LibreChat</h1>
  </a>
</p>

<p align="center">
  <a href="https://discord.gg/NGaa9RPCft"> 
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
  <a aria-label="Sponsors" href="#sponsors">
    <img
      src="https://img.shields.io/badge/SPONSORS-brightgreen.svg?style=for-the-badge&logo=github-sponsors&logoColor=white&labelColor=000000&logoWidth=20">
  </a>
</p>

# Features
 - 🖥️ UI matching ChatGPT, including Dark mode, Streaming, and 11-2023 updates
 - 💬 Multimodal Chat:
     - Upload and analyze images with GPT-4-Vision 📸 
     - More filetypes and Assistants API integration in Active Development 🚧 
 - 🌎 Multilingual UI:
     - English, 中文, Deutsch, Español, Français, Italiano, Polski, Português Brasileiro, Русский
     - 日本語, Svenska, 한국어, Tiếng Việt, 繁體中文, العربية, Türkçe, Nederlands
 - 🤖 AI model selection: OpenAI API, Azure, BingAI, ChatGPT Browser, PaLM2, Anthropic (Claude), Plugins
 - 💾 Create, Save, & Share Custom Presets
 - 🔄 Edit, Resubmit, and Continue messages with conversation branching
 - 📤 Export conversations as screenshots, markdown, text, json.
 - 🔍 Search all messages/conversations
 - 🔌 Plugins, including web access, image generation with DALL-E-3 and more
 - 👥 Multi-User, Secure Authentication with Moderation and Token spend tools
 - ⚙️ Configure Proxy, Reverse Proxy, Docker, many Deployment options, and completely Open-Source

[For a thorough review of our features, see our docs here](https://docs.librechat.ai/features/plugins/introduction.html) 📚


## All-In-One AI Conversations with LibreChat
LibreChat brings together the future of assistant AIs with the revolutionary technology of OpenAI's ChatGPT. Celebrating the original styling, LibreChat gives you the ability to integrate multiple AI models. It also integrates and enhances original client features such as conversation and message search, prompt templates and plugins.

With LibreChat, you no longer need to opt for ChatGPT Plus and can instead use free or pay-per-call APIs. We welcome contributions, cloning, and forking to enhance the capabilities of this advanced chatbot platform.
  
<!-- https://github.com/danny-avila/LibreChat/assets/110412045/c1eb0c0f-41f6-4335-b982-84b278b53d59 -->

[![Watch the video](https://img.youtube.com/vi/pNIOs1ovsXw/maxresdefault.jpg)](https://youtu.be/pNIOs1ovsXw)
Click on the thumbnail to open the video☝️

---

## ⚠️ [Breaking Changes](docs/general_info/breaking_changes.md) ⚠️

**Please read this before updating from a previous version**

---

## Changelog 
Keep up with the latest updates by visiting the releases page - [Releases](https://github.com/danny-avila/LibreChat/releases)

---

<h1>Table of Contents</h1>

<details open>
  <summary><strong>Getting Started</strong></summary>

  * Installation
    * [Docker Compose Install🐳](docs/install/docker_compose_install.md)
    * [Linux Install🐧](docs/install/linux_install.md)
    * [Mac Install🍎](docs/install/mac_install.md)
    * [Windows Install💙](docs/install/windows_install.md)
  * Configuration
    * [.env Configuration](./docs/install/dotenv.md)
    * [APIs and Tokens](docs/install/apis_and_tokens.md)
    * [User Auth System](docs/install/user_auth_system.md)
    * [Online MongoDB Database](docs/install/mongodb.md)
    * [Default Language](docs/install/default_language.md)
    * [LiteLLM Proxy: Load Balance LLMs + Spend Tracking](docs/install/litellm.md)
</details>

<details>
  <summary><strong>General Information</strong></summary>

  * [Code of Conduct](.github/CODE_OF_CONDUCT.md)
  * [Project Origin](docs/general_info/project_origin.md)
  * [Multilingual Information](docs/general_info/multilingual_information.md)
  * [Tech Stack](docs/general_info/tech_stack.md)   
</details>

<details>
  <summary><strong>Features</strong></summary>

  * **Plugins**
    * [Introduction](docs/features/plugins/introduction.md)
    * [Google](docs/features/plugins/google_search.md)
    * [Stable Diffusion](docs/features/plugins/stable_diffusion.md)
    * [Wolfram](docs/features/plugins/wolfram.md)
    * [Make Your Own Plugin](docs/features/plugins/make_your_own.md)
    * [Using official ChatGPT Plugins](docs/features/plugins/chatgpt_plugins_openapi.md)

  
  * [Automated Moderation](docs/features/mod_system.md)
  * [Token Usage](docs/features/token_usage.md)
  * [Manage Your Database](docs/features/manage_your_database.md)
  * [PandoraNext Deployment Guide](docs/features/pandoranext.md)
  * [Third-Party Tools](docs/features/third_party.md)
  * [Proxy](docs/features/proxy.md)
  * [Bing Jailbreak](docs/features/bing_jailbreak.md)

</details>

<details>
  <summary><strong>Cloud Deployment</strong></summary>

  * [DigitalOcean](docs/deployment/digitalocean.md)
  * [Azure](docs/deployment/azure-terraform.md)
  * [Linode](docs/deployment/linode.md)
  * [Cloudflare](docs/deployment/cloudflare.md)
  * [Ngrok](docs/deployment/ngrok.md)
  * [HuggingFace](docs/deployment/huggingface.md)
  * [Render](docs/deployment/render.md)
  * [Meilisearch in Render](docs/deployment/meilisearch_in_render.md)
  * [Hetzner](docs/deployment/hetzner_ubuntu.md)
  * [Heroku](docs/deployment/heroku.md)
</details>

<details>
  <summary><strong>Contributions</strong></summary>
  
  * [Contributor Guidelines](.github/CONTRIBUTING.md)
  * [Documentation Guidelines](docs/contributions/documentation_guidelines.md)
  * [Contribute a Translation](docs/contributions/translation_contribution.md)
  * [Code Standards and Conventions](docs/contributions/coding_conventions.md)
  * [Testing](docs/contributions/testing.md)
  * [Security](.github/SECURITY.md)
  * [Project Roadmap](https://github.com/users/danny-avila/projects/2)
</details>


---

## Star History

<a href="https://star-history.com/#danny-avila/LibreChat&Date">
  <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=danny-avila/LibreChat&type=Date&theme=dark" onerror="this.src='https://api.star-history.com/svg?repos=danny-avila/LibreChat&type=Date'" />
</a>

---

## Sponsors

  Sponsored by <a href="https://github.com/mjtechguy"><b>@mjtechguy</b></a>, <a href="https://github.com/SphaeroX"><b>@SphaeroX</b></a>, <a href="https://github.com/DavidDev1334"><b>@DavidDev1334</b></a>, <a href="https://github.com/fuegovic"><b>@fuegovic</b></a>, <a href="https://github.com/Pharrcyde"><b>@Pharrcyde</b></a> 
  
---

## Contributors
Contributions and suggestions bug reports and fixes are welcome!
Please read the documentation before you do!

---

For new features, components, or extensions, please open an issue and discuss before sending a PR. 

- Join the [Discord community](https://discord.gg/uDyZ5Tzhct)

This project exists in its current state thanks to all the people who contribute
---
<a href="https://github.com/danny-avila/LibreChat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=danny-avila/LibreChat" />
</a>
