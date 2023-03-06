# ChatGPT Clone #
![chatgpt-clone demo](./public/demo.gif)
## Wrap all conversational AIs under one roof. ##
  Assistant AIs are the future and OpenAI revolutionized this movement with ChatGPT. While numerous methods exist to integrate these AIs, this app commemorates the original styling of ChatGPT, with the ability to integrate any current/future AI models, while improving upon original client features, such as conversation search and prompt templates (currently WIP). This project was started early in Feb '23, anticipating the release of the official ChatGPT API from OpenAI, and now uses it along with access to the free version. Through this clone, you can avoid subscription-based models (ChatGPT Plus) in favor of free or pay-per-call APIs. I will soon deploy a demo of this app. Feel free to contribute, clone, or fork. Currently dockerized.

## Updates
<details open>
<summary><strong>2023-03-06</strong></summary>
Due to increased interest in the repo, I've dockerized the app as of this update for quick setup! See setup instructions below. I realize this still takes some time with installing docker dependencies, so it's on the roadmap to have a deployed demo. Besides this, I've made major improvements for a lot of the existing features across the board, mainly UI/UX.
</details>
<details>
<summary><strong>2023-03-04</strong></summary>
Custom prompt prefixing and labeling is now supported through the official API. This nets some interesting results when you need ChatGPT for specific uses or entertainment. Select 'CustomGPT' in the model menu to configure this, and you can choose to save the configuration or reference it by conversation. Model selection will change by conversation.
</details>

<details>
<summary><strong>Previous Updates</strong></summary>

<details>
<summary><strong>2023-03-01</strong></summary>
Official ChatGPT API is out! Removed davinci since the official API is extremely fast and 10x less expensive. Since user labeling and prompt prefixing is officially supported, I will add a View feature so you can set this within chat, which gives the UI an added use case. I've kept the BrowserClient, since it's free to use like the official site.

The Messages UI correctly mirrors code syntax highlighting. The exact replication of the cursor is not 1-to-1 yet, but pretty close. Later on in the project, I'll implement tests for code edge cases and explore the possibility of running code in-browser. Right now, unknown code defaults to javascript, but will detect language as close as possible.
</details>
<details>
<summary><strong>2023-02-21</strong></summary>
BingAI is integrated (although sadly limited by Microsoft with the 5 msg/convo limit, 50 msgs/day). I will need to handle the case when Bing refuses to give more answers on top of the other styling features I have in mind. Official ChatGPT use is back with the new BrowserClient. Brainstorming how to handle the UI when the Ai model changes, since conversations can't be persisted between them (or perhaps build a way to achieve this at some level).
</details>
<details >
<summary><strong>2023-02-15</strong></summary>
Just got access to Bing AI so I'll be focusing on integrating that through waylaidwanderer's 'experimental' BingAIClient.
</details>
<details>
<summary><strong>2023-02-14</strong></summary>

Official ChatGPT use is no longer possible though I recently used it with waylaidwanderer's [reverse proxy method](https://github.com/waylaidwanderer/node-chatgpt-api/blob/main/README.md#using-a-reverse-proxy), and before that, through leaked models he also discovered.

Currently, this project is only functional with the `text-davinci-003` model.
</details>
</details>

# Table of Contents
   * [Roadmap](#roadmap)
   * [Features](#features)
   * [Tech Stack](#tech-stack)
   * [Getting Started](#getting-started)
      * [Prerequisites](#prerequisites)
      * [Usage](#usage)
         <!-- * [Module](#module)
         * [API Server](#api-server)
         * [CLI](#cli) -->
      * [Using a Reverse Proxy](#using-a-reverse-proxy)
   * [Caveats](#caveats)
   * [Contributing](#contributing)
   * [License](#license)

## Roadmap

> **Warning**

>  This is a work in progress. I'm building this in public. You can follow the progress here or on my [Linkedin](https://www.linkedin.com/in/danny-avila).

Here are my recently completed and planned features:

- [x] Persistent conversation
- [x] Rename, delete conversations
- [x] UI Error handling
- [x] Bing AI integration
- [x] AI model change handling (start new convos within existing, remembers last selected)
- [x] Code block handling (highlighting, markdown, clipboard, language detection)
- [x] Markdown handling
- [x] Customize prompt prefix/label (custom ChatGPT using official API)
- [x] Server convo pagination (limit fetch and load more with 'show more' button)
- [x] Config file for easy startup (docker compose)
- [ ] Conversation Search (by title)
- [ ] Resubmit/edit sent messages
- [ ] Semantic Search Option (requires more tokens)
- [ ] Bing AI Styling (for suggested responses, convo end, etc.)
- [ ] Prompt Templates/Search
- [ ] Refactor/clean up code (tech debt)
- [ ] Optional use of local storage for credentials
- [ ] Mobile styling (half-finished)
- [ ] Deploy demo

### Features

- Response streaming identical to ChatGPT through server-sent events
- UI from original ChatGPT, including Dark mode
- AI model selection, including OpenAI's official ChatGPT API

### Tech Stack

- Utilizes [node-chatgpt-api](https://github.com/waylaidwanderer/node-chatgpt-api)
- No React boilerplate/toolchain, created from scratch with react@latest
- Use of Tailwind CSS and [shadcn/ui](https://github.com/shadcn/ui) components
- Docker, useSWR, Redux, Express, MongoDB, [Keyv](https://www.npmjs.com/package/keyv)

## Use Cases ##

  - One stop shop for all conversational AIs, with the added bonus of searching past conversations.
  - Using the official API, you'd have to generate 7.5 million words to expense the same cost as ChatGPT Plus ($20).
  - ChatGPT/Google Bard/Bing AI conversations are lost in space or
  cannot be searched past a certain timeframe.
  - ChatGPT Free (at [chat.openai.com](https://chat.openai.com/chat)) is more limited than the API

    ![use case example](./public/use_case2.png "chat.openai.com is getting more limited by the day!")

  - ChatGPT Free is down.

    ![use case example](./public/use_case.png "GPT is down! Plus is too expensive!")


## Origin ##
  This project was originally created as a Minimum Viable Product (or MVP) for the [@HackReactor](https://github.com/hackreactor/) Bootcamp. It was built with OpenAI response streaming and most of the UI completed in under 20 hours. During the end of that time, I had most of the UI and basic functionality done. This was created without using any boilerplates or templates, including create-react-app and other toolchains. I didn't follow any 'un-official chatgpt' video tutorials, and simply referenced the official site for the UI. The purpose of the exercise was to learn setting up a full stack project from scratch. Please feel free to give feedback, suggestions, or fork the project for your own use.

<!-- ## Solution ##
  Serves and searches all conversations reliably. All AI convos under one house.
  Pay per call and not per month (cents compared to dollars). -->

## Getting Started

### Prerequisites
- Node.js >= 19.0.0
- npm
- [Docker (optional)](https://www.docker.com/get-started/)
- [OpenAI API key](https://platform.openai.com/account/api-keys)
- BingAI, ChatGPT access tokens (optional, free AIs)

## Usage

<details open>
<summary><strong>BingAI Instructions</strong></summary>

<details open>
<summary><strong>ChatGPT Free Instructions</strong></summary>

See [`demos/use-browser-client.js`](demos/use-browser-client.js).
</details>

## Caveats
### Regarding `ChatGPTClient`
From @waylaidwanderer's use of the official API: Since `gpt-3.5-turbo` is ChatGPT's underlying model, I had to do my best to replicate the way the official ChatGPT website uses it.
This means my implementation or the underlying model may not behave exactly the same in some ways:
- Conversations are not tied to any user IDs, so if that's important to you, you should implement your own user ID system.
- ChatGPT's model parameters (temperature, frequency penalty, etc.) are unknown, so I set some defaults that I thought would be reasonable.
- Conversations are limited to roughly the last 3000 tokens, so earlier messages may be forgotten during longer conversations.
  - This works in a similar way to ChatGPT, except I'm pretty sure they have some additional way of retrieving context from earlier messages when needed (which can probably be achieved with embeddings, but I consider that out-of-scope for now).

## Contributing
If you'd like to contribute, please create a pull request with a detailed description of your changes.

## License
This project is licensed under the MIT License.
