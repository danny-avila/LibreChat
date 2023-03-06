# ChatGPT Clone #
![chatgpt-clone demo](./public/demo.gif)
## Wrap all conversational AIs under one roof. ##
  Assistant AIs are the future and OpenAI revolutionized this movement with ChatGPT. While numerous methods exist to integrate these AIs, this app commemorates the original styling of ChatGPT, with the ability to integrate any current/future AI models through user-provided API keys, while improving upon original client features, such as conversation search and prompt templates. This project was built with the anticipation of the official ChatGPT API from OpenAI, and now uses it along with the free access method. Through this clone, you can avoid subscription-based models in favor of free or pay-per-call APIs. I will deploy a demo of this app, but feel free to clone or fork to create your own custom wrapper. Currently dockerized.

## Updates
<details open>
<summary><strong>2023-03-06</strong></summary>
Due to more interest in this repo, I've dockerized the app as of this update for quick setup! See setup instructions below. I realize this still takes some time with installing docker dependencies, so it's on the roadmap to have a deployed demo. Besides this, I've made major improvements for a lot of the existing features across the board, mainly UI/UX.
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

## Roadmap

> **Warning**

>  This is a work in progress. I'm building this in public. You can follow the progress here or on my [Linkedin](https://www.linkedin.com/in/danny-avila).

Here are my planned/recently finished features.

- [x] Rename, delete conversations
- [x] Persistent conversation
- [x] UI Error handling
- [x] AI Model Selection
- [x] Bing AI integration
- [x] Remember last selected model
- [x] Highlight.js for code blocks
- [x] Markdown handling
- [x] Language Detection for code blocks
- [x] 'Copy to clipboard' button for code blocks
- [x] Customize prompt prefix/label (custom ChatGPT using official API)
- [x] AI model change handling (start new convos within existing convo)
- [x] Server convo pagination (limit fetch and load more with 'show more' button)
- [x] Config file for easy startup (docker compose)
- [ ] Conversation Search (by title)
- [ ] Resubmit/edit sent messages
- [ ] Semantic Search Option (requires more tokens)
- [ ] Bing AI Styling (for suggested responses, convo end, etc.)
- [ ] Prompt Templates/Search
- [ ] Refactor/clean up code (tech debt)
- [ ] Mobile styling (half-finished)
- [ ] Deploy demo

### Features

- Response streaming identical to ChatGPT
- UI from original ChatGPT, including Dark mode
- AI model selection, including OpenAI's official ChatGPT API

### Tech Stack

- Utilizes [node-chatgpt-api](https://github.com/waylaidwanderer/node-chatgpt-api)
- Response streaming identical to ChatGPT through server-sent events
- Use of Tailwind CSS (like the official site) and [shadcn/ui](https://github.com/shadcn/ui) components
- highlight.js, useSWR, Redux, Express, MongoDB, [Keyv](https://www.npmjs.com/package/keyv)

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

## How to Get Started ##
> **Warning**
>  Working on easy startup/config code. Still in development.

  <!-- ## License

Licensed under the [insert license here](). -->
