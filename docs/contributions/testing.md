---
title: 🧪 Testing During Development
description: How to locally test the app during development.
weight: -6
---

# Locally test the app during development

## Local Unit Tests

Before submitting your updates, it’s crucial to verify they pass all unit tests. Follow these steps to run tests locally:

- copy your `.env.example` file in the `/api` folder and rename it to `.env`
```bash
cp .env.example ./api/.env
```
- add `NODE_ENV=CI` to your `/api/.env` file
- `npm run test:client`
- `npm run test:api`

!!! failure "Warning"
    When executed locally, this API unit test is expected to fail. This should be the only error encountered.
    ![image](https://github.com/danny-avila/LibreChat/assets/32828263/d222034c-9c3a-4764-b972-39e954c92170)


