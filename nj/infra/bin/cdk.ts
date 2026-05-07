#!/usr/bin/env node

/**
 * AWS CDK Application Entry Point for NJ AI Assistant Service
 *
 * This file serves as the main entry point for the AWS CDK application, responsible for
 * bootstrapping the infrastructure deployment process. It creates the CDK app instance and
 * instantiates the NJ AI Assistant stack with appropriate configuration for different environments.
 *
 * The application supports environment-specific deployments and follows AWS CDK best practices for
 * infrastructure as code. Environment configuration is determined through CDK context variables and
 * AWS CLI configuration.
 *
 * @version 1.2.0
 * @file CDK application bootstrap and stack instantiation
 * @example
 *   ```bash
 *   # Deploy to default environment
 *   cdk deploy˙
 *
 *   # Deploy to specific account and region
 *   cdk deploy --context account=123456789012 --context region=us-east-1
 *
 *   # Synthesize CloudFormation template
 *   cdk synth
 *   ```;
 *
 * @see {@link https://docs.aws.amazon.com/cdk/latest/guide/} AWS CDK Developer Guide
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { ECS_PATTERNS_UNIQUE_TARGET_GROUP_ID } from 'aws-cdk-lib/cx-api';
import { DatabaseStack } from '../lib/db-stack';
import { EcsStack } from '../lib/ecs-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { KitchenSinkStack } from '../lib/kitchensink-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { assets, branding } from '../lib/branding';

const app = new cdk.App({
  postCliContext: {
    [ECS_PATTERNS_UNIQUE_TARGET_GROUP_ID]: true,
  },
});

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

type AwsEnv = 'prod' | 'dev';

const AWS_ENV = (process.env.AWS_ENV ?? 'dev') as AwsEnv;
const isProd = AWS_ENV === 'prod';

const domainNames: Record<AwsEnv, string> = {
  prod: 'ai-assistant.nj.gov',
  dev: 'dev.ai-assistant.nj.gov',
};

const tagEnvNames: Record<AwsEnv, string> = {
  prod: 'production',
  dev: 'development',
};

const envVars = {
  domainName: domainNames[AWS_ENV],
  env: AWS_ENV,
  isProd,
};

const ragApiJwtSecretSuffix: Record<AwsEnv, string> = {
  dev: '5vHiQq',
  prod: 'YipukF',
};

const adminPanelSessionSecretSuffix: Record<AwsEnv, string> = {
  dev: 'tlVoWO',
  prod: 'r5o4mG',
};

const commonTags = {
  Project: 'AIAssistantService',
  ManagedBy: 'CDK',
  Environment: tagEnvNames[AWS_ENV],
  Agency: '997',
  Org: '0005',
  CloudPortfolioID: '0293',
};

function applyTags(stack: cdk.Stack) {
  Object.entries(commonTags).forEach(([key, value]) => {
    cdk.Tags.of(stack).add(key, value);
  });
}

const databaseStack = new DatabaseStack(app, 'DatabaseStack', {
  env: env,
  envVars: envVars,
});

const ecsStack = new EcsStack(app, 'EcsStack', {
  env: env,
  envVars: envVars,
  mongoImage: `${env.account}.dkr.ecr.${env.region}.amazonaws.com/newjersey/mongo:latest`,
  librechatAdminImage: `${env.account}.dkr.ecr.${env.region}.amazonaws.com/newjersey/librechat-admin-panel:${AWS_ENV}`,
  certificateArn: `arn:aws:acm:${env.region}:${env.account}:certificate/${process.env.ACM_CERTIFICATE_ID}`,
  redisEndpoint: databaseStack.redisEndpoint,
  redisPort: databaseStack.redisPort,
  redisSecurityGroup: databaseStack.redisSecurityGroup,
  rdsEndpoint: databaseStack.rdsEndpoint,
  rdsPort: databaseStack.rdsPort,
  rdsSecurityGroup: databaseStack.rdsSecurityGroup,
  rdsSecret: databaseStack.rdsSecret,
  ragApiJwtSecretArn: `arn:aws:secretsmanager:${env.region}:${env.account}:secret:ai-assistant/rag-api/jwt-secret-${ragApiJwtSecretSuffix[AWS_ENV]}`,
  adminPanelSessionSecretArn: `arn:aws:secretsmanager:${env.region}:${env.account}:secret:ai-assistant/admin-panel/session-secret-${adminPanelSessionSecretSuffix[AWS_ENV]}`,
  mongoSecretArn: `arn:aws:secretsmanager:${env.region}:${env.account}:secret:ai-assistant/dev/mongodb-Ajw7aQ`
});

const cognitoStack = new CognitoStack(app, 'CognitoStack', {
  env: env,
  envVars: envVars,
  branding: branding,
  assets: assets,
});

if (!isProd) {
  const lambdaStack = new LambdaStack(app, 'LambdaStack', {
    env,
    envVars,
  });

  if (ecsStack.mongoService) {
    ecsStack.mongoService.connections.allowFrom(
      lambdaStack.lambdaSg,
      ec2.Port.tcp(27017),
      'clearUser Lambda to MongoDB',
    );
  }

  applyTags(lambdaStack);
}

const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  env: env,
  service: ecsStack.service,
  isProd,
  rdsInstanceIdentifier: databaseStack.rdsInstanceIdentifier,
  docDbClusterIdentifier: databaseStack.docDbClusterIdentifier,
  elastiCacheName: databaseStack.elastiCacheName,
});

applyTags(databaseStack);
applyTags(ecsStack);
applyTags(cognitoStack);
applyTags(monitoringStack);

if (process.env.DEPLOY_KITCHENSINK === 'true') {
  const kitchenSinkStack = new KitchenSinkStack(app, 'KitchenSinkStack', {
    env: env,
    listenerArn: ecsStack.listener.listenerArn,
    certificateArn: `arn:aws:acm:${env.region}:${env.account}:certificate/${process.env.LIBRECHAT_ACM_CERTIFICATE_ID}`,
    mongoSecretArn: `arn:aws:secretsmanager:${env.region}:${env.account}:secret:ai-assistant/kitchensink/mongodb-B2athN`,
    ragApiJwtSecretArn: `arn:aws:secretsmanager:${env.region}:${env.account}:secret:ai-assistant/rag-api/jwt-secret-${ragApiJwtSecretSuffix[AWS_ENV]}`,
  });

  applyTags(kitchenSinkStack);
}
