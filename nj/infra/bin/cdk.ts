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
import * as ec2 from "aws-cdk-lib/aws-ec2"
import { DatabaseStack } from "../lib/db-stack";
import { EcsStack } from "../lib/ecs-stack";
import { ApigStack } from "../lib/apig-stack";
import { CognitoStack } from "../lib/cognito-stack";
import {branding, assets} from "../lib/branding";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const isProd = process.env.AWS_ENV?.includes("prod") ? true : false; // looks jank, but cannot be undefined
const tagEnv = isProd ? "production" : "development";

const envVars = {
  domainName : isProd ? "ai-assistant.nj.gov" : "dev.ai-assistant.nj.gov",
  env: isProd ? "prod" : "dev", 
  isProd: isProd
}

if (isProd) {
  const databaseStack = new DatabaseStack(app, "DatabaseStack", {
    env: env,
    envVars: envVars,
  });

  cdk.Tags.of(databaseStack).add("Project", "AIAssistantService");
  cdk.Tags.of(databaseStack).add("ManagedBy", "CDK");
  cdk.Tags.of(databaseStack).add("Environment", tagEnv);
}

// TODO: Add SSM Parameter check for latest librechat version for prod
const ecsStack = new EcsStack(app, "EcsStack", {
  env: env,
  envVars: envVars,
  mongoImage: `${env.account}.dkr.ecr.${env.region}.amazonaws.com/newjersey/mongo:latest`,
  postgresImage: `${env.account}.dkr.ecr.${env.region}.amazonaws.com/newjersey/pgvector:0.8.0-pg15-trixie`,
});

const apiGatewayStack = new ApigStack(app, "ApiGatewayStack", {
  env: env,
  envVars: envVars,
  listener: ecsStack.listener,
});
cdk.Tags.of(apiGatewayStack).add("Project", "AIAssistantService");
cdk.Tags.of(apiGatewayStack).add("ManagedBy", "CDK");
cdk.Tags.of(apiGatewayStack).add("Environment", tagEnv);

const cognitoStack = new CognitoStack(app, "CognitoStack", {
  env: env,
  envVars: envVars,
  branding: branding,
  assets: assets,
});

cdk.Tags.of(ecsStack).add("Project", "AIAssistantService");
cdk.Tags.of(ecsStack).add("ManagedBy", "CDK");
cdk.Tags.of(ecsStack).add("Environment", tagEnv);

cdk.Tags.of(cognitoStack).add("Project", "AIAssistantService");
cdk.Tags.of(cognitoStack).add("ManagedBy", "CDK");
cdk.Tags.of(cognitoStack).add("Environment", tagEnv);
