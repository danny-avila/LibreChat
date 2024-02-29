---
title: 🪙 Token Usage
description: This doc covers how to track and control your token usage for the OpenAI/Plugins endpoints in LibreChat. You will learn how to view your transactions, enable user balances, and add credits to your account.
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

## Listing of balances

To see the balances of your users, you can run:

```bash
npm run list-balances
```

## Notes

- With summarization enabled, you will be blocked from making an API request if the cost of the content that you need to summarize + your messages payload exceeds the current balance
- Counting Prompt tokens is really accurate for OpenAI calls, but not 100% for plugins (due to function calling). It is really close and conservative, meaning its count may be higher by 2-5 tokens.
- The system allows deficits incurred by the completion tokens. It only checks if you have enough for the prompt Tokens, and is pretty lenient with the completion. The graph below details the logic
- The above said, plugins are checked at each generation step, since the process works with multiple API calls. Anything the LLM has generated since the initial user prompt is shared to the user in the error message as seen below.
- There is a 150 token buffer for titling since this is a 2 step process, that averages around 200 total tokens. In the case of insufficient funds, the titling is cancelled before any spend happens and no error is thrown.

![image](https://github.com/danny-avila/LibreChat/assets/110412045/78175053-9c38-44c8-9b56-4b81df61049e)

## More details
source: [LibreChat/discussions/1640](https://github.com/danny-avila/LibreChat/discussions/1640#discussioncomment-8251970)

> "rawAmount": -000, // what's this?

Raw amount of tokens as counted per the tokenizer algorithm.

>    "tokenValue": -00000, // what's this?

Token credits value. 1000 credits = $0.001 (1 mill USD)

> "rate": 00, // what's this?

The rate at which tokens are charged as credits. 

For example, gpt-3.5-turbo-1106 has a rate of 1 for user prompt (input) and 2 for completion (output)

| Model                 | Input                | Output               |
|-----------------------|----------------------|----------------------|
| gpt-3.5-turbo-1106    | $0.0010 / 1K tokens  | $0.0020 / 1K tokens  |


Given the provided example:

    "rawAmount": -137
    "tokenValue": -205.5
    "rate": 1.5

![image](https://github.com/danny-avila/LibreChat/assets/32828263/c71139f2-da3f-4550-bbd1-aa51ad52dfaa)

And to get the real amount of USD spend based on **Token Value**:

![image](https://github.com/danny-avila/LibreChat/assets/32828263/757e1b65-acb1-40d8-986e-8d595cf45e08)

The relevant file for editing rates is found in `api/models/tx.js`

## Preview

![image](https://github.com/danny-avila/LibreChat/assets/110412045/39a1aa5d-f8fc-43bf-81f2-299e57d944bb)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/e1b1cc3f-8981-4c7c-a5f8-e7badbc6f675)