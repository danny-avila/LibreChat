# # Changelog
<details open>
<summary><strong>2023-05-09</strong></summary>
 
**Released [v0.4.1](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.1)**
 
 * update user system section of readme by @danorlando in #207
 * remove github-passport and update package.lock files by @danorlando in #208
 * Update README.md by @fuegovic in #209
 * fix: fix browser refresh redirecting to /chat/new by @danorlando in #210
 * fix: fix issue with validation when google account has multiple spaces in username by @danorlando in #211
 * chore: update docker image version to use latest by @danny-avila in #218
 * update documentation structure by @fuegovic in #220
 * Feat: Add Azure support by @danny-avila in #219
 * Update Message.js by @DavidDev1334 in #191
 
⚠️ **IMPORTANT :** Since V0.4.0 You should register and login with a local account (email and password) for the first time sign-up. if you use login for the first time with a social login account (eg. Google, facebook, etc.), the conversations and presets that you created before the user system was implemented will NOT be migrated to that account.

⚠️ **Breaking - new Env Variables :** Since V0.4.0 You will need to add the new env variables from .env.example for the app to work, even if you're not using multiple users for your purposes.

For discussion and suggestion you can join us: **[community discord server](https://discord.gg/NGaa9RPCft)**
</details>


 <details>
<summary><strong>2023-05-07</strong></summary>

**Released [v0.4.0](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.0)**, Introducing User/Auth System and OAuth2/Social Login! You can now register and login with an email account or use Google login. Your your previous conversations and presets will migrate to your new profile upon creation. Check out the details in the [User/Auth System](#userauth-system) section of the README.md.
 
⚠️ **IMPORTANT :** You should register and login with a local account (email and password) for the first time sign-up. if you use login for the first time with a social login account (eg. Google, facebook, etc.), the conversations and presets that you created before the user system was implemented will NOT be migrated to that account.

⚠️ **Breaking - new Env Variables :** You will need to add the new env variables from .env.example for the app to work, even if you're not using multiple users for your purposes.

For discussion and suggestion you can join us: **[community discord server](https://discord.gg/NGaa9RPCft)**
</details>
 

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

**Released [v0.0.6](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.0.6)**, the latest stable release before **Searching messages** goes live tomorrow. See exact updates to date in the tag link. By request, there is now also a **[community discord server](https://s
</details>

<details>
<summary><strong>2023-03-20</strong></summary>

**Searching messages** is almost here as I test more of its functionality. There've been a lot of great features requested and great contributions and I will work on some soon, namely, further customizing the custom gpt params with sliders similar to the OpenAI playground, and including the custom params and system messages available to Bing.

The above features are next and then I will have to focus on building the **test environment.** I would **greatly appreciate** help in this area with any test environment you're familiar with (mocha, chai, jest, playwright, puppeteer). This is to aid in the velocity of contributing and to save time I spend debugging.

On that note, I had to switch the default branch due to some breaking changes that haven't been straight forward to debug, mainly related to node-chat-gpt the main dependency of the project. Thankfully, my working branch, now switched to default as main, is working as expected.
</details>


##

## [Go Back to ReadMe](README.md)
