
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
  <a aria-label="Join the community on Discord" href="https://discord.gg/NGaa9RPCft">
    <img alt="" src="https://img.shields.io/badge/Join%20the%20community-blueviolet.svg?style=for-the-badge&logo=DISCORD&labelColor=000000&logoWidth=20">
  </a>
  <a aria-label="Sponsors" href="#sponsors">
    <img alt="" src="https://img.shields.io/badge/SPONSORS-brightgreen.svg?style=for-the-badge&labelColor=000000&logoWidth=20">
  </a>
</p>

## All AI Conversations under One Roof. ##
  Assistant AIs are the future and OpenAI revolutionized this movement with ChatGPT. While numerous UIs exist, this app commemorates the original styling of ChatGPT, with the ability to integrate any current/future AI models, while integrating and improving upon original client features, such as conversation/message search and prompt templates (currently WIP). Through this clone, you can avoid ChatGPT Plus in favor of free or pay-per-call APIs. I will soon deploy a demo of this app. Feel free to contribute, clone, or fork. Currently dockerized.
  
  ![clone3](https://user-images.githubusercontent.com/110412045/230538752-9b99dc6e-cd02-483a-bff0-6c6e780fa7ae.gif)

# Features

- Response streaming identical to ChatGPT through server-sent events
- UI from original ChatGPT, including Dark mode
- AI model selection (through 3 endpoints: OpenAI API, BingAI, and ChatGPT Browser)
- Create, Save, & Share custom presets for OpenAI and BingAI endpoints - [More info on customization here](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.3.0)
- Edit and Resubmit messages just like the official site (with conversation branching)
- Search all messages/conversations - [More info here](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.1.0)
- Integrating plugins soon

##
# Sponsors

  Sponsored by <a href="https://github.com/DavidDev1334"><b>@DavidDev1334</b></a>, <a href="https://github.com/mjtechguy"><b>@mjtechguy</b></a>, <a href="https://github.com/Pharrcyde"><b>@Pharrcyde</b></a>, & <a href="https://github.com/fuegovic"><b>@fuegovic</b></a>
---
# ⚠️ **Breaking Changes** ⚠️
Note: These changes only apply to users who are updating from a previous version of the app.

- We have simplified the configuration process by using a single `.env` file in the root folder instead of separate `/api/.env` and `/client/.env` files.
- By running `npm ci` the upgrade script should automatically copy the content of both files to the new `.env` file and backup the old ones in the root dir.
- The upgrade script requires both `/api/.env` and `/client/.env` files to run properly. If you get an error about a missing client env file, just rename the `/client/.env.example` file to `/client/.env` and run the script again.
- We have renamed the `OPENAI_KEY` variable to `OPENAI_API_KEY` to match the official documentation. The upgrade script should do this automatically for you, but please double-check that your key is correct in the new `.env` file.
- After running the upgrade script, the `OPENAI_API_KEY` variable might be placed in a different section in the new `.env` file than before. This does not affect the functionality of the app, but if you want to keep it organized, you can look for it near the bottom of the file and move it to its usual section.
---
- For enhanced security, we are now asking for crypto keys for securely storing credentials in the `.env` file. Crypto keys are used to encrypt and decrypt sensitive data such as passwords and access keys. If you don't set them, the app will crash on startup.
- You need to fill the following variables in the `.env` file with 32-byte (64 characters in hex) or 16-byte (32 characters in hex) values:
  - `CREDS_KEY` (32-byte)
  - `CREDS_IV` (16-byte)
  - `JWT_SECRET` (32-byte, optional but recommended)
- You can use this replit to generate some crypto keys quickly: https://replit.com/@daavila/crypto#index.js
- Make sure you keep your crypto keys safe and don't share them with anyone.

We apologize for any inconvenience caused by these changes. We hope you enjoy the new and improved version of our app!

---

## [Read all Latest Updates here](CHANGELOG.md)

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
  * [Roadmap](docs/general_info/roadmap.md)
  * [Tech Stack](docs/general_info/tech_stack.md)
  * [Changelog](CHANGELOG.md)
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


##

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=danny-avila/chatgpt-clone&type=Date)](https://star-history.com/#danny-avila/chatgpt-clone&Date)

## Contributors
Contributions and suggestions bug reports and fixes are welcome!
Please read the documentation before you do!

For new features, components, or extensions, please open an issue and discuss before sending a PR. 

- Join the [Discord community](https://discord.gg/uDyZ5Tzhct)

This project exists in its current state thanks to all the people who contribute
---
<a href="https://github.com/danny-avila/chatgpt-clone/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=danny-avila/chatgpt-clone" />
</a>
