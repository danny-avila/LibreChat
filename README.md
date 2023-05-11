
<p align="center">
  <a href="https://discord.gg/NGaa9RPCft">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/110412045/228325485-9d3e618f-a980-44fe-89e9-d6d39164680e.png">
      <img src="https://user-images.githubusercontent.com/110412045/228325485-9d3e618f-a980-44fe-89e9-d6d39164680e.png" height="128">
    </picture>
    <h1 align="center">ChatGPT Clone</h1>
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

##

<details open>
<summary><strong>2023-05-11</strong></summary>
 
**Released [v0.4.2](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.2)**
 
ChatGPT-Clone received some important upgrades and improvements. A new contributor, [@qcgm1978](https://github.com/qcgm1978), makes their first contribution by adding a null check for adaptiveCards variable. Additionally, support for titling conversations with the Azure endpoint is added by [@danny-avila](https://github.com/danny-avila) in PR [#234](https://github.com/danny-avila/chatgpt-clone/pull/234). In PR [#235](https://github.com/danny-avila/chatgpt-clone/pull/235), [@danny-avila](https://github.com/danny-avila) also makes some necessary fixes to titling, quotation marks, and endpoints being unavailable with only the Azure key provided. The logging system is now powered by Pino and sanitization, thanks to [@danorlando](https://github.com/danorlando) in PR [#227](https://github.com/danny-avila/chatgpt-clone/pull/227). To bulletproof the Docker container, the .dockerignore file is updated to include the client/.env file by [@danny-avila](https://github.com/danny-avila) in PR [#241](https://github.com/danny-avila/chatgpt-clone/pull/241). This issue was brought to our attention on discord.

There is active work on the new Plugins feature, converting the frontend to Typescript, and looking to integrate Palm2, google's new generative AI accessible via API, to the project as a new endpoint.

You can check the full changelog in between [v0.4.1](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.1) and [v0.4.2](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.2) [here](https://github.com/danny-avila/chatgpt-clone/compare/v0.4.1...v0.4.2)."

⚠️ **IMPORTANT :** Since V0.4.0 You should register and login with a local account (email and password) for the first time sign-up. if you use login for the first time with a social login account (eg. Google, facebook, etc.), the conversations and presets that you created before the user system was implemented will NOT be migrated to that account.

⚠️ **Breaking - new Env Variables :** Since V0.4.0 You will need to add the new env variables from .env.example for the app to work, even if you're not using multiple users for your purposes.

For discussion and suggestion you can join us: **[community discord server](https://discord.gg/NGaa9RPCft)**
</details>

[Past Updates](CHANGELOG.md)
##

<h1>Table of Contents</h1>

<details open>
  <summary><strong>Getting Started</strong></summary>

  * [Docker Install](/documents/install/docker_install.md)
  * [Linux Install](documents/install/linux_install.md)
  * [Mac Install](documents/install/mac_install.md)
  * [Windows Install](documents/install/windows_install.md)
</details>

<details>
  <summary><strong>General Information</strong></summary>

  * [Project Origin](documents/general_info/project_origin.md)
  * [Roadmap](documents/general_info/roadmap.md)
  * [Tech Stack](documents/general_info/tech_stack.md)
  * [Changelog](CHANGELOG.md)
  * [Bing Jailbreak Info](documents/general_info/bing_jailbreak_info.md)
</details>

<details>
  <summary><strong>Features</strong></summary>

  * [User Auth System](documents/features/user_auth_system.md)
  * [Proxy](documents/features/proxy.md)
</details>

<details>
  <summary><strong>Cloud Deployment</strong></summary>

  * [Heroku](documents/deployment/heroku.md)
</details>

<details>
  <summary><strong>Contributions</strong></summary>

  * [Code of Conduct](documents/contributions/code_of_conduct.md)
  * [Contributor Guidelines](documents/contributions/contributor_guidelines.md)
  * [Documentation Guidelines](documents/contributions/documentation_guidelines.md)
  * [Testing](documents/contributions/testing.md)
  * [Pull Request Template](documents/contributions/pull_request_template.md)
  * [Contributors](CONTRIBUTORS.md)
  * [Trello Board](https://trello.com/b/17z094kq/chatgpt-clone)
</details>

<details>
  <summary><strong>Report Templates</strong></summary>

  * [Bug Report Template](documents/report_templates/bug_report_template.md)
  * [Custom Issue Template](documents/report_templates/custom_issue_template.md)
  * [Feature Request Template](documents/report_templates/feature_request_template.md)
</details>

##
### [Alternative Documentation](https://chatgpt-clone.gitbook.io/chatgpt-clone-docs/get-started/docker)

##

## Contributing

Contributions and suggestions bug reports and fixes are welcome!
Please read the documentation before you do!

For new features, components, or extensions, please open an issue and discuss before sending a PR. 

- Join the [Discord community](https://discord.gg/NGaa9RPCft)

## License
This project is licensed under the [MIT License](LICENSE.md).
##

