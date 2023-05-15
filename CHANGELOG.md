# # Changelog
<details open>
<summary><strong>2023-05-14</strong></summary>
 
**Released [v0.4.4](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.4):**

1. The Msg Clipboard was changed to a checkmark for improved user experience by @techwithanirudh in PR [#247](https://github.com/danny-avila/chatgpt-clone/pull/247).
2. A typo in the auth.json path for accessing Google Palm was corrected by @antonme in PR [#266](https://github.com/danny-avila/chatgpt-clone/pull/266).
3. @techwithanirudh added a Popup Menu to save sidebar space in PR [#260](https://github.com/danny-avila/chatgpt-clone/pull/260). 
4. The default pageSize in Conversation.js was increased from 12 to 14 by @danny-avila in PR [#267](https://github.com/danny-avila/chatgpt-clone/pull/267).
5. Fonts were updated by @techwithanirudh in PR [#261](https://github.com/danny-avila/chatgpt-clone/pull/261).
6. Font file paths in style.css were changed by @danny-avila in PR [#268](https://github.com/danny-avila/chatgpt-clone/pull/268).
7. Code was fixed to adjust max_tokens according to model selection by @p4w4n in PR [#263](https://github.com/danny-avila/chatgpt-clone/pull/263).
8. Various improvements were made, such as fixing react errors and adjusting the mobile view, by @danny-avila in PR [#269](https://github.com/danny-avila/chatgpt-clone/pull/269).

New contributors to the project include:

- @techwithanirudh, who made their first contribution in PR [#247](https://github.com/danny-avila/chatgpt-clone/pull/247).
- @antonme, who made their first contribution in PR [#266](https://github.com/danny-avila/chatgpt-clone/pull/266).
- @p4w4n, who made their first contribution in PR [#263](https://github.com/danny-avila/chatgpt-clone/pull/263).

The [full changelog can be found here](https://github.com/danny-avila/chatgpt-clone/compare/v0.4.3...v0.4.4)
</details>
 <details>
<summary><strong>2023-05-13</strong></summary>
 
**Released [v0.4.3](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.3) which now supports Google's PaLM 2!**
  
  ![image](https://github.com/danny-avila/chatgpt-clone/assets/110412045/ec5e8ff3-6c3a-4f25-9687-d8558435d094)
 
**How to Setup PaLM 2 (via Google Cloud Vertex AI API)**

- Enable the Vertex AI API on Google Cloud:
- - https://console.cloud.google.com/vertex-ai
- Create a Service Account:
- - https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1
- Make sure to click 'Create and Continue' to give at least the 'Vertex AI User' role.
- Create a JSON key, rename as 'auth.json' and save it in /api/data/.

**Alternatively**

- In your ./api/.env file, set PALM_KEY as "user_provided" to allow the user to provide a Service Account key JSON from the UI.
- They will follow the steps above except for renaming the file, simply importing the JSON when prompted.
- The key is sent to the server but never saved except in your local storage

**Note:**

- Vertex AI does not (yet) support response streaming for text generations, so response may seem to take long when generating a lot of text.
- Text streaming is simulated


You can check the full changelog in between v0.4.2 and v0.4.3 [here](https://github.com/danny-avila/chatgpt-clone/compare/v0.4.2...v0.4.3).
</details>

<details>
<summary><strong>2023-05-11</strong></summary>
 
**Released [v0.4.2](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.2)**
 
ChatGPT-Clone received some important upgrades and improvements. A new contributor, [@qcgm1978](https://github.com/qcgm1978), makes their first contribution by adding a null check for adaptiveCards variable. Additionally, support for titling conversations with the Azure endpoint is added by [@danny-avila](https://github.com/danny-avila) in PR [#234](https://github.com/danny-avila/chatgpt-clone/pull/234). In PR [#235](https://github.com/danny-avila/chatgpt-clone/pull/235), [@danny-avila](https://github.com/danny-avila) also makes some necessary fixes to titling, quotation marks, and endpoints being unavailable with only the Azure key provided. The logging system is now powered by Pino and sanitization, thanks to [@danorlando](https://github.com/danorlando) in PR [#227](https://github.com/danny-avila/chatgpt-clone/pull/227). To bulletproof the Docker container, the .dockerignore file is updated to include the client/.env file by [@danny-avila](https://github.com/danny-avila) in PR [#241](https://github.com/danny-avila/chatgpt-clone/pull/241). This issue was brought to our attention on discord.

There is active work on the new Plugins feature, converting the frontend to Typescript, and looking to integrate Palm2, google's new generative AI accessible via API, to the project as a new endpoint.

You can check the full changelog in between [v0.4.1](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.1) and [v0.4.2](https://github.com/danny-avila/chatgpt-clone/releases/tag/v0.4.2) [here](https://github.com/danny-avila/chatgpt-clone/compare/v0.4.1...v0.4.2)."

For discussion and suggestion you can join us: **[community discord server](https://discord.gg/NGaa9RPCft)**
</details>

<details>
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
