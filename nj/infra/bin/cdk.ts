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
import { EcsStack } from "../lib/ecs-stack";
import { ApigStack } from "../lib/apig-stack";
import { CognitoStack } from "../lib/cognito-stack";
import {branding, assets} from "../lib/branding";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const ecsStack = new EcsStack(app, "EcsStack", {
  env: env,
  vpcId: "***REMOVED***",
  librechatImage: "***REMOVED***.dkr.ecr.us-east-1.amazonaws.com/newjersey/librechat:latest",
  mongoImage: "***REMOVED***.dkr.ecr.us-east-1.amazonaws.com/newjersey/mongo:latest",
  postgresImage: "***REMOVED***.dkr.ecr.us-east-1.amazonaws.com/newjersey/pgvector:0.8.0-pg15-trixie",
  certificateArn: "arn:aws:acm:us-east-1:***REMOVED***:certificate/b795286d-3044-4e95-ba06-21e81fc5022e"
});

const apiGatewayStack = new ApigStack(app, "ApiGatewayStack", {
  env: env,
  vpcId: "***REMOVED***",
  listener: ecsStack.listener,
  domainName: "dev.ai-assistant.nj.gov",
});

const cognitoStack = new CognitoStack(app, "CognitoStack", {
  env: env,
  callback_urls: ["https://dev.ai-assistant.nj.gov/oauth/openid/callback"],
  logout_urls: ["https://dev.ai-assistant.nj.gov/oauth/openid/logout"],
  branding: branding,
  assets: assets,
});

cdk.Tags.of(ecsStack).add("Project", "AIAssistantService");
cdk.Tags.of(ecsStack).add("ManagedBy", "CDK");
cdk.Tags.of(ecsStack).add("Environment", process.env.NODE_ENV ?? "development");

cdk.Tags.of(apiGatewayStack).add("Project", "AIAssistantService");
cdk.Tags.of(apiGatewayStack).add("ManagedBy", "CDK");
cdk.Tags.of(apiGatewayStack).add("Environment", process.env.NODE_ENV ?? "development");

cdk.Tags.of(cognitoStack).add("Project", "AIAssistantService");
cdk.Tags.of(cognitoStack).add("ManagedBy", "CDK");
cdk.Tags.of(cognitoStack).add("Environment", process.env.NODE_ENV ?? "development");
