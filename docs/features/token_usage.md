---
title: 🪙 Token Usage
weight: -7
---
# Token Usage

As of v6.0.0, LibreChat accurately tracks token usage for the OpenAI/Plugins endpoints.
This can be viewed in your Database's "Transactions" collection. 

In the future, you will be able to toggle viewing how much a conversation has cost you.

Currently, you can limit user token usage by enabling user balances. Set the following .env variable to enable this:

```bash
CHECK_BALANCE=true # Enables token credit limiting for the OpenAI/Plugins endpoints
```

You manually add user balance, or you will need to build out a balance-accruing system for users. This may come as a feature to the app whenever an admin dashboard is introduced.

To manually add balances, run the following command (npm required):
```bash
npm run add-balance
```

You can also specify the email and token credit amount to add, e.g.:
```bash
npm run add-balance danny@librechat.ai 1000
```

This works well to track your own usage for personal use; 1000 credits = $0.001 (1 mill USD)

## Notes

- With summarization enabled, you will be blocked from making an API request if the cost of the content that you need to summarize + your messages payload exceeds the current balance
- Counting Prompt tokens is really accurate for OpenAI calls, but not 100% for plugins (due to function calling). It is really close and conservative, meaning its count may be higher by 2-5 tokens.
- The system allows deficits incurred by the completion tokens. It only checks if you have enough for the prompt Tokens, and is pretty lenient with the completion. The graph below details the logic
- The above said, plugins are checked at each generation step, since the process works with multiple API calls. Anything the LLM has generated since the initial user prompt is shared to the user in the error message as seen below.
- There is a 150 token buffer for titling since this is a 2 step process, that averages around 200 total tokens. In the case of insufficient funds, the titling is cancelled before any spend happens and no error is thrown.

![image](https://github.com/danny-avila/LibreChat/assets/110412045/78175053-9c38-44c8-9b56-4b81df61049e)

## Preview

![image](https://github.com/danny-avila/LibreChat/assets/110412045/39a1aa5d-f8fc-43bf-81f2-299e57d944bb)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/e1b1cc3f-8981-4c7c-a5f8-e7badbc6f675)