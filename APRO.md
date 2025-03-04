# LibreChat Fork

## Description

This is a fork of [LibreChat](https://github.com/danny-avila/LibreChat), an open-source chat application that supports multiple AI models and APIs.

The main purpose of this fork is to support AWS Bedrock Agents.

## Development

1. Clone the repository:
2. Ensure you have Bedrock set up in your AWS account in the `eu-central-1` region.
3. Copy `.env.example` -> `.env`
4. Ensure `AWS_PROFILE` is exported in your shell
5. Ensure you have logged in to your AWS account in your terminal
6. Run `direnv allow` to export the AWS credentials env as `BEDROCK_<credentials>` envs.
7. Put credentials in .env.config
8. Run `npm install`
9. Start the application:

```
docker-compose -f docker-compose.services.yaml up
npm run backend:dev
npm run frontend:dev
```

10. Visit `http://localhost:3090` and make stuff!
