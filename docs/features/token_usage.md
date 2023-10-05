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