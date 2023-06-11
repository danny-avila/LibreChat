<p align="center">
  <a href="https://discord.gg/NGaa9RPCft">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/110412045/228325485-9d3e618f-a980-44fe-89e9-d6d39164680e.png">
      <img src="https://user-images.githubusercontent.com/110412045/228325485-9d3e618f-a980-44fe-89e9-d6d39164680e.png" height="128">
    </picture>
    <h1 align="center">LibreChat</h1>
  </a>
</p>

<p align="center">
  <a href="https://discord.gg/NGaa9RPCft"> 
    <img src="https://img.shields.io/discord/1086345563026489514?label=&logo=discord&style=for-the-badge&logoWidth=20&labelColor=000000&color=blueviolet">
  </a>
  <a aria-label="Sponsors" href="#sponsors">
    <img alt="" src="https://img.shields.io/badge/SPONSORS-brightgreen.svg?style=for-the-badge&labelColor=000000&logoWidth=20">
  </a>
</p>

## All-In-One AI Conversations with LibreChat ##
LibreChat brings together the future of assistant AIs with the revolutionary technology of OpenAI's ChatGPT. Celebrating the original styling, LibreChat gives you the ability to integrate multiple AI models. It also integrates and enhances original client features such as conversation and message search, prompt templates and plugins.

With LibreChat, you no longer need to opt for ChatGPT Plus and can instead use free or pay-per-call APIs. We welcome contributions, cloning, and forking to enhance the capabilities of this advanced chatbot platform.
  
<!--   ![clone3](https://user-images.githubusercontent.com/110412045/230538752-9b99dc6e-cd02-483a-bff0-6c6e780fa7ae.gif) -->
https://github.com/danny-avila/LibreChat/assets/110412045/c1eb0c0f-41f6-4335-b982-84b278b53d59

# Features

- Response streaming identical to ChatGPT through server-sent events
- UI from original ChatGPT, including Dark mode
- AI model selection (through 5 endpoints: OpenAI API, BingAI, ChatGPT Browser, PaLM2, Plugins)
- Create, Save, & Share custom presets - [More info on prompt presets here](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.3.0)
- Edit and Resubmit messages with conversation branching
- Search all messages/conversations - [More info here](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.1.0)
- Plugins now available (including web access, image generation and more)

---
# ⚠️ **Breaking Changes** ⚠️
Note: These changes only apply to users who are updating from a previous version of the app.

- We have simplified the configuration process by using a single `.env` file in the root folder instead of separate `/api/.env` and `/client/.env` files.
- If you had installed a previous version, you can run `npm run upgrade` to automatically copy the content of both files to the new `.env` file and backup the old ones in the root dir.
- If you are installing the project for the first time, it's recommend you run the installation script `npm run install` to guide your local setup (otherwise continue to use docker)
- The docker-compose file had some change. Review the [new docker instructions](docs\install\docker_install.md) to make sure you are setup properly. This is still the simplest and most effective method.
- The upgrade script requires both `/api/.env` and `/client/.env` files to run properly. If you get an error about a missing client env file, just rename the `/client/.env.example` file to `/client/.env` and run the script again.
- We have renamed the `OPENAI_KEY` variable to `OPENAI_API_KEY` to match the official documentation. The upgrade script should do this automatically for you, but please double-check that your key is correct in the new `.env` file.
- After running the upgrade script, the `OPENAI_API_KEY` variable might be placed in a different section in the new `.env` file than before. This does not affect the functionality of the app, but if you want to keep it organized, you can look for it near the bottom of the file and move it to its usual section.

##

- For enhanced security, we are now asking for crypto keys for securely storing credentials in the `.env` file. Crypto keys are used to encrypt and decrypt sensitive data such as passwords and access keys. If you don't set them, the app will crash on startup.
- You need to fill the following variables in the `.env` file with 32-byte (64 characters in hex) or 16-byte (32 characters in hex) values:
  - `CREDS_KEY` (32-byte)
  - `CREDS_IV` (16-byte)
  - `JWT_SECRET` (32-byte, optional but recommended)
- You can use this replit to generate some crypto keys quickly: https://replit.com/@daavila/crypto#index.js
- Make sure you keep your crypto keys safe and don't share them with anyone.

We apologize for any inconvenience caused by these changes. We hope you enjoy the new and improved version of our app!

---

## Changelog 
- Keep up with the latest updates by visiting the releases page - [Releases](https://github.com/danny-avila/LibreChat/releases)

---

<h1>Table of Contents</h1>

<details open>
  <summary><strong>Getting Started</strong></summary>

  * [Docker Install](/docs/install/docker_install.md)
  * [Linux Install](docs/install/linux_install.md)
  * [Mac Install](docs/install/mac_install.md)
  * [Windows Install](docs/install/windows_install.md)
  * [APIs and Tokens](docs/install/apis_and_tokens.md)
</details>

<details>
  <summary><strong>General Information</strong></summary>

  * [Code of Conduct](CODE_OF_CONDUCT.md)
  * [Project Origin](docs/general_info/project_origin.md)
  * [Multilingual Information](docs/general_info/multilingual_information.md)
  * [Tech Stack](docs/general_info/tech_stack.md)
  * [Bing Jailbreak Info](docs/general_info/bing_jailbreak_info.md)
</details>

<details>
  <summary><strong>Features</strong></summary>

  * **Plugins**
    * [Introduction](docs/features/plugins/introduction.md)
    * [Google](docs/features/plugins/google_search.md)
    * [Stable Diffusion](docs/features/plugins/stable_diffusion.md)
    * [Wolfram](docs/features/plugins/wolfram.md)
    * [Make Your Own Plugin](docs/features/plugins/make_your_own.md)

  * [User Auth System](docs/features/user_auth_system.md)
  * [Proxy](docs/features/proxy.md)
</details>

<details>
  <summary><strong>Cloud Deployment</strong></summary>

  * [Heroku](docs/deployment/heroku.md)
</details>

<details>
  <summary><strong>Contributions</strong></summary>

  * [Contributor Guidelines](CONTRIBUTING.md)
  * [Documentation Guidelines](docs/contributions/documentation_guidelines.md)
  * [Code Standards and Conventions](docs/contributions/coding_conventions.md)
  * [Testing](docs/contributions/testing.md)
  * [Security](SECURITY.md)
  * [Trello Board](https://trello.com/b/17z094kq/chatgpt-clone)
</details>


---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=danny-avila/chatgpt-clone&type=Date)](https://star-history.com/#danny-avila/chatgpt-clone&Date)

---

## Sponsors

  Sponsored by <a href="https://github.com/DavidDev1334"><b>@DavidDev1334</b></a>, <a href="https://github.com/mjtechguy"><b>@mjtechguy</b></a>, <a href="https://github.com/Pharrcyde"><b>@Pharrcyde</b></a>, & <a href="https://github.com/fuegovic"><b>@fuegovic</b></a>

---

## Contributors
Contributions and suggestions bug reports and fixes are welcome!
Please read the documentation before you do!

---

For new features, components, or extensions, please open an issue and discuss before sending a PR. 

- Join the [Discord community](https://discord.gg/uDyZ5Tzhct)

This project exists in its current state thanks to all the people who contribute
---
<a href="https://github.com/danny-avila/chatgpt-clone/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=danny-avila/chatgpt-clone" />
</a>
