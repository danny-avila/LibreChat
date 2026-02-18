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
import {branding, assets} from "../lib/branding";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const isProd = process.env.AWS_ENV?.includes("prod") ? true : false; // looks jank, but cannot be undefined
const tagEnv = isProd ? "production" : "development";

const envVars = {
  domainName : isProd ? "prod.ai-assistant.nj.gov" : "dev.ai-assistant.nj.gov",
  env: isProd ? "prod" : "dev", 
  isProd: isProd
}

const commonTags = {
  Project: "AIAssistantService",
  ManagedBy: "CDK",
  Environment: tagEnv,
  Agency: "997",
  Org: "0005",
  CloudPortfolioId: "0293"
};

function applyTags(stack: cdk.Stack) {
  Object.entries(commonTags).forEach(([key, value]) => {
    cdk.Tags.of(stack).add(key, value);
  });
}

if (isProd) {
  const databaseStack = new DatabaseStack(app, "DatabaseStack", {
    env: env,
    envVars: envVars,
    deployPG: false
  });

  applyTags(databaseStack);
}

const ecsStack = new EcsStack(app, "EcsStack", {
  env: env,
  envVars: envVars,
  mongoImage: `${env.account}.dkr.ecr.${env.region}.amazonaws.com/newjersey/mongo:latest`,
  postgresImage: `${env.account}.dkr.ecr.${env.region}.amazonaws.com/newjersey/pgvector:0.8.0-pg15-trixie`,
  certificateArn: `arn:aws:acm:${env.region}:${env.account}:certificate/${process.env.ACM_CERTIFICATE_ID}`
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

applyTags(ecsStack);
applyTags(cognitoStack);
applyTags(monitoringStack);
