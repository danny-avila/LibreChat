# ChatGPT Clone #
https://user-images.githubusercontent.com/110412045/223754183-8b7f45ce-6517-4bd5-9b39-c624745bf399.mp4

## All AI Conversations under One Roof. ##
  Assistant AIs are the future and OpenAI revolutionized this movement with ChatGPT. While numerous methods exist to integrate them, this app commemorates the original styling of ChatGPT, with the ability to integrate any current/future AI models, while improving upon original client features, such as conversation search and prompt templates (currently WIP).

  This project was started early in Feb '23, anticipating the release of the official ChatGPT API from OpenAI, and now uses it. Through this clone, you can avoid ChatGPT Plus in favor of free or pay-per-call APIs. I will soon deploy a demo of this app. Feel free to contribute, clone, or fork. Currently dockerized.

## Updates
<details open>
<summary><strong>2023-03-16</strong></summary>



[Latest release (v0.0.4)](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.0.4) includes Resubmitting messages & Branching messages, which mirrors official ChatGPT feature of editing a sent message, that then branches the conversation into separate message paths (works only with ChatGPT)

Full details and [example here](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.0.4). Message search is on the docket

</details>

<details>
<details>
<summary><strong>2023-03-12</strong></summary>




Really thankful for all the issues reported and contributions made, the project's features and improvements have accelerated as result. Honorable mention is [wtlyu](https://github.com/wtlyu) for contributing a lot of mindful code, namely hostname configuration and mobile styling. I will upload images on next release for faster docker setup, and starting updating them simultaneously with this repo.



Many improvements across the board, the biggest is being able to start conversations simultaneously (again thanks to [wtlyu](https://github.com/wtlyu) for bringing it to my attention), as you can switch conversations or start a new chat without any response streaming from a prior one, as the backend will still process/save client responses. Just watch out for any rate limiting from OpenAI/Microsoft if this is done excessively.


Adding support for conversation search is next! Thank you [mysticaltech](https://github.com/mysticaltech) for bringing up a method I can use for this.
</details>
<details>
<summary><strong>2023-03-09</strong></summary>
Released v.0.0.2

Adds Sydney (jailbroken Bing AI) to the model menu. Thank you [DavesDevFails](https://github.com/DavesDevFails) for bringing it to my attention in this [issue](https://github.com/danny-avila/chatgpt-clone/issues/13). Bing/Sydney now correctly cite links, more styling to come. Fix some overlooked bugs, and model menu doesn't close upon deleting a customGpt.


I've re-enabled the ChatGPT browser client (free version) since it might be working for most people, it no longer works for me. Sydney is the best free route anyway.
</details>
<details>
<summary><strong>2023-03-07</strong></summary>
Due to increased interest in the repo, I've dockerized the app as of this update for quick setup! See setup instructions below. I realize this still takes some time with installing docker dependencies, so it's on the roadmap to have a deployed demo. Besides this, I've made major improvements for a lot of the existing features across the board, mainly UI/UX.


Also worth noting, the method to access the Free Version is no longer working, so I've removed it from model selection until further notice.
</details>
<summary><strong>Previous Updates</strong></summary>

<details>
<summary><strong>2023-03-04</strong></summary>
Custom prompt prefixing and labeling is now supported through the official API. This nets some interesting results when you need ChatGPT for specific uses or entertainment. Select 'CustomGPT' in the model menu to configure this, and you can choose to save the configuration or reference it by conversation. Model selection will change by conversation.
</details>
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
- [ChatGPT Clone](#chatgpt-clone)
  - [All AI Conversations under One Roof.](#all-ai-conversations-under-one-roof)
  - [Updates](#updates)
- [Table of Contents](#table-of-contents)
  - [Roadmap](#roadmap)
    - [Features](#features)
    - [Tech Stack](#tech-stack)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
  - [Usage](#usage)
    - [Local](#local)
    - [Docker](#docker)
    - [Access Tokens](#access-tokens)
    - [Proxy](#proxy)
    - [User System](#user-system)
    - [Updating](#updating)
  - [Use Cases](#use-cases)
  - [Origin](#origin)
  - [Caveats](#caveats)
    - [Regarding use of Official ChatGPT API](#regarding-use-of-official-chatgpt-api)
  - [Contributing](#contributing)
  - [License](#license)

## Roadmap

> **Warning**

>  This is a work in progress. I'm building this in public. FYI there is still a lot of tech debt to cleanup. You can follow the progress here or on my [Linkedin](https://www.linkedin.com/in/danny-avila).

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
- [x] Mobile styling (thanks to [wtlyu](https://github.com/wtlyu))
- [x] Resubmit/edit sent messages (thanks to [wtlyu](https://github.com/wtlyu))
- [ ] Message Search
- [ ] Custom params for ChatGPT API (temp, top_p, presence_penalty)
- [ ] Bing AI Styling (params, suggested responses, convo end, etc.) - **In progress**
- [ ] Add warning before clearing convos
- [ ] Build test suite for CI/CD
- [ ] Prompt Templates/Search
- [ ] Refactor/clean up code (tech debt)
- [ ] Optional use of local storage for credentials
- [ ] Deploy demo

### Features

- Response streaming identical to ChatGPT through server-sent events
- UI from original ChatGPT, including Dark mode
- AI model selection (official ChatGPT API, BingAI, ChatGPT Free)
- Create and Save custom ChatGPTs*

^* ChatGPT can be 'customized' by setting a system message or prompt prefix and alternate 'role' to the API request

[More info here](https://platform.openai.com/docs/guides/chat/instructing-chat-models). Here's an [example from this app.]()

### Tech Stack

- Utilizes [node-chatgpt-api](https://github.com/waylaidwanderer/node-chatgpt-api)
- No React boilerplate/toolchain/clone tutorials, created from scratch with react@latest
- Use of Tailwind CSS and [shadcn/ui](https://github.com/shadcn/ui) components
- Docker, useSWR, Redux, Express, MongoDB, [Keyv](https://www.npmjs.com/package/keyv)

## Getting Started

### Prerequisites
- npm
- Node.js >= 19.0.0
- MongoDB installed or [MongoDB Atlas](https://account.mongodb.com/account/login) (required if not using Docker)
- [Docker (optional)](https://www.docker.com/get-started/)
- [OpenAI API key](https://platform.openai.com/account/api-keys)
- BingAI, ChatGPT access tokens (optional, free AIs)

## Usage

- **Clone/download** the repo down where desired
```bash
  git clone https://github.com/danny-avila/chatgpt-clone.git
```
- If using MongoDB Atlas, remove `&w=majority` from default connection string.

### Local
- **Run npm** install in both the api and client directories
- **Provide** all credentials, (API keys, access tokens, and Mongo Connection String) in api/.env [(see .env example)](api/.env.example)
- **Run** `npm run build` in /client/ dir, `npm start` in /api/ dir
- **Visit** http://localhost:3080 (default port) & enjoy

By default, only local machine can access this server. To share within network or serve as a public server, set `HOST` to `0.0.0.0` in `.env` file

### Docker

- **Provide** all credentials, (API keys, access tokens, and Mongo Connection String) in [docker-compose.yml](docker-compose.yml) under api service
- **Run** `docker-compose up` to start the app

### Access Tokens

<details>
<summary><strong>ChatGPT Free Instructions</strong></summary>

To get your Access token For ChatGPT 'Free Version', login to chat.openai.com, then visit https://chat.openai.com/api/auth/session.


**Warning:** There may be a high chance of your account being banned with this method. Continue doing so at your own risk.

</details>

<details>
<summary><strong>BingAI Instructions</strong></summary>
The Bing Access Token is the "_U" cookie from bing.com. Use dev tools or an extension while logged into the site to view it.

**Note:** Specific error handling and styling for this model is still in progress.
</details>

### Proxy

If your server cannot connect to the chatGPT API server by some reason, (eg in China). You can set a environment variable `PROXY`. This will be transmitted to `node-chatgpt-api` interface.

**Warning:** `PROXY` is not `reverseProxyUrl` in `node-chatgpt-api`

<details>
<summary><strong>Set up proxy in local environment </strong></summary>

Here is two ways to set proxy.
- Option 1: system level environment
`export PROXY="http://127.0.0.1:7890"`
- Option 2: set in .env file
`PROXY="http://127.0.0.1:7890"`

**Change `http://127.0.0.1:7890` to your proxy server**
</details>

<details>
<summary><strong>Set up proxy in docker environment </strong></summary>

set in docker-compose.yml file, under services - api - environment

```
    api:
        ...
        environment:
                ...
                - "PROXY=http://127.0.0.1:7890"
                # add this line ↑
```

**Change `http://127.0.0.1:7890` to your proxy server**

</details>

### User System

By default, there is no user system enabled, so anyone can access your server.

**This project is not designed to provide a complete and full-featured user system.** It's not high priority task and might never be provided.

[wtlyu](https://github.com/wtlyu) provide a sample user system structure, that you can implement your own user system. It's simple and not a ready-for-use edition. 

(If you want to implement your user system, open this ↓)

<details>
<summary><strong>Implement your own user system </strong></summary>

To enable the user system, set `ENABLE_USER_SYSTEM=1` in your `.env` file.

The sample structure is simple. It provide three basic endpoint:

1. `/auth/login` will redirect to your own login url. In the sample code, it's `/auth/your_login_page`.
2. `/auth/logout` will redirect to your own logout url. In the sample code, it's `/auth/your_login_page/logout`.
3. `/api/me` will return the userinfo: `{ username, display }`.
   1. `username` will be used in db, used to distinguish between users.
   2. `display` will be displayed in UI.

The only one thing that drive user system work is `req.session.user`. Once it's set, the client will be trusted. Set to `null` if logout.

Please refer to `/api/server/routes/authYourLogin.js` file. It's very clear and simple to tell you how to implement your user system.

Or you can ask chatGPT to write the code for you, here is one example to connect LDAP:

```
Please write me an express module, that serve the login and logout endpoint as a router. The login and logout uri is '/' and '/logout'. Once loginned, save display name and username in session.user, as {display, username}. Then redirect to '/'. Please write the code using express and other lib, and storage any server configuration in a config variable. I want the user to be connected to my LDAP server.
```

</details>


### Updating
- As the project is still a work-in-progress, you should pull the latest and run the steps over. Reset your browser cache/clear site data.

## Use Cases ##

  - One stop shop for all conversational AIs, with the added bonus of searching past conversations.
  - Using the official API, you'd have to generate 7.5 million words to expense the same cost as ChatGPT Plus ($20).
  - ChatGPT/Google Bard/Bing AI conversations are lost in space or
  cannot be searched past a certain timeframe.
  - **Customize ChatGPT**

    ![use case example](./images/use_case3.png "Make a Custom GPT")

  - **API is not as limited as ChatGPT Free (at [chat.openai.com](https://chat.openai.com/chat))**

    ![use case example](./images/use_case2.png "chat.openai.com is getting more limited by the day!")

  - **ChatGPT Free is down.**

    ![use case example](./images/use_case.png "GPT is down! Plus is too expensive!")


## Origin ##
  This project was originally created as a Minimum Viable Product (or MVP) for the [@HackReactor](https://github.com/hackreactor/) Bootcamp. It was built with OpenAI response streaming and most of the UI completed in under 20 hours. During the end of that time, I had most of the UI and basic functionality done. This was created without using any boilerplates or templates, including create-react-app and other toolchains. I didn't follow any 'un-official chatgpt' video tutorials, and simply referenced the official site for the UI. The purpose of the exercise was to learn setting up a full stack project from scratch. Please feel free to give feedback, suggestions, or fork the project for your own use.


## Caveats
### Regarding use of Official ChatGPT API
From [@waylaidwanderer](https://github.com/waylaidwanderer/node-chatgpt-api/blob/main/README.md#caveats):

Since `gpt-3.5-turbo` is ChatGPT's underlying model, I had to do my best to replicate the way the official ChatGPT website uses it.
This means my implementation or the underlying model may not behave exactly the same in some ways:
- Conversations are not tied to any user IDs, so if that's important to you, you should implement your own user ID system.
- ChatGPT's model parameters (temperature, frequency penalty, etc.) are unknown, so I set some defaults that I thought would be reasonable.
- Conversations are limited to roughly the last 3000 tokens, so earlier messages may be forgotten during longer conversations.
  - This works in a similar way to ChatGPT, except I'm pretty sure they have some additional way of retrieving context from earlier messages when needed (which can probably be achieved with embeddings, but I consider that out-of-scope for now).

## Contributing
If you'd like to contribute, please create a pull request with a detailed description of your changes.

## License
This project is licensed under the MIT License.
