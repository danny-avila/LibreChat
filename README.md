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

### Features

- Response streaming identical to ChatGPT through server-sent events
- UI from original ChatGPT, including Dark mode
- AI model selection (through 3 endpoints: OpenAI API, BingAI, and ChatGPT Browser)
- Create, Save, & Share custom presets for OpenAI and BingAI endpoints - [More info on customization here](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.3.0)
- Edit and Resubmit messages just like the official site (with conversation branching)
- Search all messages/conversations - [More info here](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.1.0)
- Integrating plugins soon

## Sponsors

  Sponsored by <a href="https://github.com/DavidDev1334"><b>@DavidDev1334</b></a>, <a href="https://github.com/mjtechguy"><b>@mjtechguy</b></a>, <a href="https://github.com/Pharrcyde"><b>@Pharrcyde</b></a>, & <a href="https://github.com/fuegovic"><b>@fuegovic</b></a>


## Updates
<details open>
<summary><strong>2023-05-07</strong></summary>



**Released [v0.4.0](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.0)**, Introducing User/Auth System and OAuth2/Social Login! You can now register and login with an email account or use Google login. Your your previous conversations and presets will migrate to your new profile upon creation. Check out the details in the [User/Auth System](#userauth-system) section of the README.md.
 
⚠️ **IMPORTANT :** You should register and login with a local account (email and password) for the first time sign-up. if you use login for the first time with a social login account (eg. Google, facebook, etc.), the conversations and presets that you created before the user system was implemented will NOT be migrated to that account.

⚠️ **Breaking - new Env Variables :** You will need to add the new env variables from .env.example for the app to work, even if you're not using multiple users for your purposes.

For discussion and suggestion you can join us: **[community discord server](https://discord.gg/NGaa9RPCft)**

</details>

<details>
<summary><strong>Previous Updates</strong></summary>

<details>
<summary><strong>2023-04-05</strong></summary>

**Released [v0.3.0](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.3.0)**, Introducing more customization for both OpenAI & BingAI conversations! This is one of the biggest updates yet and will make integrating future LLM's a lot easier, providing a lot of customization features as well, including sharing presets! Please feel free to share them in the **[community discord server](https://discord.gg/NGaa9RPCft)**

</details>

  
<details>
<summary><strong>2023-03-23</strong></summary>



**Released [v0.1.0](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.1.0)**, **searching messages/conversations is live!** Up next is more custom parameters for customGpt's. Join the discord server for more immediate assistance and update: **[community discord server](https://discord.gg/NGaa9RPCft)**

</details>

  
<details>
<summary><strong>2023-03-22</strong></summary>



**Released [v0.0.6](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.0.6)**, the latest stable release before **Searching messages** goes live tomorrow. See exact updates to date in the tag link. By request, there is now also a **[community discord server](https://discord.gg/NGaa9RPCft)**

</details>
<details>
<summary><strong>2023-03-20</strong></summary>



**Searching messages** is almost here as I test more of its functionality. There've been a lot of great features requested and great contributions and I will work on some soon, namely, further customizing the custom gpt params with sliders similar to the OpenAI playground, and including the custom params and system messages available to Bing.

The above features are next and then I will have to focus on building the **test environment.** I would **greatly appreciate** help in this area with any test environment you're familiar with (mocha, chai, jest, playwright, puppeteer). This is to aid in the velocity of contributing and to save time I spend debugging.

On that note, I had to switch the default branch due to some breaking changes that haven't been straight forward to debug, mainly related to node-chat-gpt the main dependency of the project. Thankfully, my working branch, now switched to default as main, is working as expected.

</details>
<details>
<summary><strong>2023-03-16</strong></summary>



[Latest release (v0.0.4)](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.0.4) includes Resubmitting messages & Branching messages, which mirrors official ChatGPT feature of editing a sent message, that then branches the conversation into separate message paths (works only with ChatGPT)

Full details and [example here](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.0.4). Message search is on the docket

</details>
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

## Information
This project is being developed by @danny-avila, @wtlyu, @danorlando, @DavidDev1334, @fuegovic.

## Documentation
Need help or information about our project? Then you are welcome to check out our documentation for the project. There you will find all the information on how to set up the project on your computer or on a cloud service. 
 - https://chatgpt-clone.gitbook.io/

## Contributing

Contributions and suggestions welcome! Bug reports and fixes are welcome!

For new features, components, or extensions, please open an issue and discuss before sending a PR. 

- Join the [Discord community](https://discord.gg/NGaa9RPCft)

## License
This project is licensed under the MIT License.
