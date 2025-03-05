# LibreChat Bedrock Agents

## Description

This is a fork of [LibreChat](https://github.com/danny-avila/LibreChat).

The main purpose of this fork is to support AWS Bedrock Agents.

## Bedrock Agents Development

1. Clone the repository
2. Ensure you have Bedrock set up in your AWS account in the `eu-central-1` region.
3. Log in to your AWS account with your sso credentials, i.e. `aws sso login --profile $AWS_PROFILE`
4. install `direnv` (optional)
5. Copy `.env.apro.example` -> `.env`
6. Replace the value <placeholders> in the `.env` file

- run ``

6. Ensure you have logged in to your AWS account in your terminal
7. Run `direnv allow` to export the AWS credentials env as `BEDROCK_<credentials>` envs.
8. Put credentials in .env.config
9. Run `npm install`
10. Start the application:

```
docker-compose -f docker-compose.services.yaml up
npm run backend:dev
npm run frontend:dev
```

10. Visit `http://localhost:3090` and make stuff!
