To deploy, you will first need to load AWS credentials. You can get these from the local dev .env in bitwarden under BEDROCK_AWS_ACCESS_KEY_ID and BEDROCK_AWS_SECRET_ACCESS_KEY.

Needed env vars:
```
export CDK_DEFAULT_ACCOUNT=152320432929
export CDK_DEFAULT_REGION=us-east-1
export AWS_ACCESS_KEY_ID=<retrieve from bitwarden .env>
export AWS_SECRET_ACCESS_KEY=<retrieve from bitwarden .env>
```

Deploy Steps:
1. navigate to `infra/`
2. `npm install`
3. `npx ts-node bin/cdk.ts`
