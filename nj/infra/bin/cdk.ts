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

import * as cdk from "aws-cdk-lib";
import { DatabaseStack } from "../lib/db-stack";
import { EcsStack } from "../lib/ecs-stack";
import { CognitoStack } from "../lib/cognito-stack";
import { MonitoringStack } from "../lib/monitoring-stack";
import { KitchenSinkStack } from "../lib/kitchensink-stack";
import {branding, assets} from "../lib/branding";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

type AwsEnv = "prod" | "dev";

const AWS_ENV = (process.env.AWS_ENV ?? "dev") as AwsEnv;
const isProd = AWS_ENV === "prod";

const domainNames: Record<AwsEnv, string> = {
  prod: "ai-assistant.nj.gov",
  dev: "dev.ai-assistant.nj.gov",
};

const tagEnvNames: Record<AwsEnv, string> = {
  prod: "production",
  dev: "development",
};

const envVars = {
  domainName: domainNames[AWS_ENV],
  env: AWS_ENV,
  isProd,
}

const commonTags = {
  Project: "AIAssistantService",
  ManagedBy: "CDK",
  Environment: tagEnvNames[AWS_ENV],
  Agency: "997",
  Org: "0005",
  CloudPortfolioID: "0293"
};

function applyTags(stack: cdk.Stack) {
  Object.entries(commonTags).forEach(([key, value]) => {
    cdk.Tags.of(stack).add(key, value);
  });
}

const databaseStack = new DatabaseStack(app, "DatabaseStack", {
  env: env,
  envVars: envVars,
});

const ecsStack = new EcsStack(app, "EcsStack", {
  env: env,
  envVars: envVars,
  mongoImage: `${env.account}.dkr.ecr.${env.region}.amazonaws.com/newjersey/mongo:latest`,
  postgresImage: `${env.account}.dkr.ecr.${env.region}.amazonaws.com/newjersey/pgvector:0.8.0-pg15-trixie`,
  certificateArn: `arn:aws:acm:${env.region}:${env.account}:certificate/${process.env.ACM_CERTIFICATE_ID}`,
  redisEndpoint: databaseStack.redisEndpoint,
  redisPort: databaseStack.redisPort,
  redisSecurityGroup: databaseStack.redisSecurityGroup,
});

const cognitoStack = new CognitoStack(app, "CognitoStack", {
  env: env,
  envVars: envVars,
  branding: branding,
  assets: assets,
});

const monitoringStack = new MonitoringStack(app, "MonitoringStack", {
  env: env,
  service: ecsStack.service,
});

applyTags(databaseStack);
applyTags(ecsStack);
applyTags(cognitoStack);
applyTags(monitoringStack);

if (process.env.DEPLOY_KITCHENSINK === "true") {
  const kitchenSinkStack = new KitchenSinkStack(app, "KitchenSinkStack", {
    env: env,
    listenerArn: ecsStack.listener.listenerArn,
    loadBalancerSecurityGroupId: ecsStack.loadBalancer.connections.securityGroups[0].securityGroupId,
    certificateArn: `arn:aws:acm:${env.region}:${env.account}:certificate/${process.env.LIBRECHAT_ACM_CERTIFICATE_ID}`,
  });

  applyTags(kitchenSinkStack);
}
