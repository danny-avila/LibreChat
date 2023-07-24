# Free AI APIs

There are APIs offering free access to AI APIs via reverse proxy, and one of the major players, compatible with LibreChat, is ChimeraGPT.

Feel free to check out the others, but I haven't personally tested them: [Free AI APIs](https://github.com/NovaOSS/free-ai-apis)

### ChimeraGPT

Since ChimeraGPT works with LibreChat, and offers Llama2 along with OpenAI models, let's start with that one: [ChimeraGPT](https://discord.gg/chimeragpt)

> ⚠️ Never trust 3rd parties. Use at your own risk of privacy loss. Your data may be used for AI training at best or for nefarious reasons at worst; this is true in all cases, even with official endpoints: never give an LLM sensitive/identifying information. If something is free, you are the product. If errors arise, they are more likely to be due to the 3rd party, and not this project, as I test the official endpoints first and foremost.

You will get your API key from the discord server. The instructions are pretty clear when you join so I won't repeat them.

Once you have the API key, you should adjust your .env file like this:

```bash
##########################
# OpenAI Endpoint: 
##########################

OPENAI_API_KEY=your-chimera-api-key
# Reverse proxy settings for OpenAI: 
OPENAI_REVERSE_PROXY=https://chimeragpt.adventblocks.cc/v1/chat/completions

# OPENAI_MODELS=gpt-3.5-turbo,gpt-3.5-turbo-16k,gpt-3.5-turbo-0301,text-davinci-003,gpt-4,gpt-4-0314,gpt-4-0613
```

**Note:** The `OPENAI_MODELS` variable is commented out so that the server can fetch chimeragpt/v1/api/models for all available models. Uncomment and adjust if you wish to specify which exact models you want to use.

It's worth noting that not all models listed by their API will work, with or without this project. The exact URL may also change, just make sure you include `/v1/chat/completions` in the reverse proxy URL if it ever changes.

You can set `OPENAI_API_KEY=user_provided` if you would like the user to add their own Chimera API key, just be sure you specify the models with `OPENAI_MODELS` in this case since they won't be able to be fetched without an admin set API key.

## That's it! You're all set. 🎉

### Here's me using Llama2 via ChimeraGPT

![Screenshot 2023-07-23 201709](https://github.com/danny-avila/LibreChat/assets/110412045/f3ce0226-152c-4d53-9a6e-6370156b0735)

### Plugins also work with this reverse proxy (OpenAI models). [More info on plugins here](https://docs.librechat.ai/features/plugins/introduction.html)
![Screenshot 2023-07-23 202426](https://github.com/danny-avila/LibreChat/assets/110412045/45d0f79f-0963-49c0-9d1c-c292d1c25588)
