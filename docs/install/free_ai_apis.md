# Free AI APIs

There are APIs offering free/free-trial access to AI APIs via reverse proxy.

Here is a well-maintained public list of [Free AI APIs](https://github.com/zukixa/cool-ai-stuff) that may or may not be compatible with LibreChat

### [OpenRouter](https://openrouter.ai/) ⇆ (preferred)

While not completely free, you get free trial credits when you [sign up to OpenRouter](https://openrouter.ai/), a legitimate proxy service to a multitude of LLMs, both closed and open source, including:
- OpenAI models (great if you are barred from their API for whatever reason)
- Anthropic Claude models (same as above)
- Meta's Llama models
- pygmalionai/mythalion-13b
- and many more open source models. Newer integrations are usually discounted, too!

OpenRouter is so great, I decided to integrate it to the project as a standalone feature.

**Setup:**
- Signup to [OpenRouter](https://openrouter.ai/) and create a key. You should name it and set a limit as well.
- Set the environment variable `OPENROUTER_API_KEY` in your .env file to the key you just created.
- Restart your LibreChat server and use the OpenAI or Plugins endpoints.

**Notes:** 
- [TODO] **In the future, you will be able to set up OpenRouter from the frontend as well.**
- This will override the official OpenAI API or your reverse proxy settings for both Plugins and OpenAI.
- On initial setup, you may need to refresh your page twice to see all their supported models populate automatically.
- Plugins: Functions Agent works with OpenRouter when using OpenAI models.
- Plugins: Turn functions off to try plugins with non-OpenAI models (ChatGPT plugins will not work and others may not work as expected).
- Plugins: Make sure `PLUGINS_USE_AZURE` is not set in your .env file when wanting to use OpenRouter and you have Azure configured.

> ⚠️ OpenRouter is in a category of its own, and is highly recommended over the "free" services below. NagaAI and other 'free' API proxies tend to have intermittent issues, data leaks, and/or problems with the guidelines of the platforms they advertise on. Use the below at your own risk.

### NagaAI

Since NagaAI works with LibreChat, and offers Llama2 along with OpenAI models, let's start with that one: [NagaAI](https://t.me/chimera_ai)

> ⚠️ Never trust 3rd parties. Use at your own risk of privacy loss. Your data may be used for AI training at best or for nefarious reasons at worst; this is true in all cases, even with official endpoints: never give an LLM sensitive/identifying information. If something is free, you are the product. If errors arise, they are more likely to be due to the 3rd party, and not this project, as I test the official endpoints first and foremost.

You will get your API key from the discord server. The instructions are pretty clear when you join so I won't repeat them.

Once you have the API key, you should adjust your .env file like this:

```bash
##########################
# OpenAI Endpoint: 
##########################

OPENAI_API_KEY=your-naga-ai-api-key
# Reverse proxy settings for OpenAI: 
OPENAI_REVERSE_PROXY=https://api.naga.ac/v1/chat/completions

# OPENAI_MODELS=gpt-3.5-turbo,gpt-3.5-turbo-16k,gpt-3.5-turbo-0301,text-davinci-003,gpt-4,gpt-4-0314,gpt-4-0613
```

**Note:** The `OPENAI_MODELS` variable is commented out so that the server can fetch nagaai/api/v1/models for all available models. Uncomment and adjust if you wish to specify which exact models you want to use.

It's worth noting that not all models listed by their API will work, with or without this project. The exact URL may also change, just make sure you include `/v1/chat/completions` in the reverse proxy URL if it ever changes.

You can set `OPENAI_API_KEY=user_provided` if you would like the user to add their own NagaAI API key, just be sure you specify the models with `OPENAI_MODELS` in this case since they won't be able to be fetched without an admin set API key.

## That's it! You're all set. 🎉

### Here's me using Llama2 via NagaAI

![Screenshot 2023-07-23 201709](https://github.com/danny-avila/LibreChat/assets/110412045/f3ce0226-152c-4d53-9a6e-6370156b0735)

### Plugins also work with this reverse proxy (OpenAI models). [More info on plugins here](https://docs.librechat.ai/features/plugins/introduction.html)
![Screenshot 2023-07-23 202426](https://github.com/danny-avila/LibreChat/assets/110412045/45d0f79f-0963-49c0-9d1c-c292d1c25588)

---

>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
