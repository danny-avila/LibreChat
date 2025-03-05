# LibreChat Bedrock Agents

## Description

This is a fork of [LibreChat](https://github.com/danny-avila/LibreChat).

The main purpose of this fork is to support AWS Bedrock Agents.

## Bedrock Agents Development

1. Clone the repository
2. Ensure you have Bedrock set up in your AWS account in the `eu-central-1` region.
3. install `direnv` (optional)
4. Copy `.env.apro.example` -> `.env`
5. Update the `AWS_PROFILE` env with your AWS sso profile name in `.env`
6. Log in to your AWS account with your sso credentials, i.e. `aws sso login --profile $AWS_PROFILE`
7. Run `npm install`
8. Start the services, backend and frontend in three different terminals:

```bash
docker compose up
# NOTE: the backend and frontend process do not handle SIGINT/SIGTERM properly so we handle the cleanup with the run.sh script
./scripts/run.sh backend
./scripts/run.sh frontend
```

10. Visit `http://localhost:3090` and make stuff!

## Scripts

In the [./scripts/](./scripts/) folder, you will find a few scripts to validate that your Bedrock Agents work.
