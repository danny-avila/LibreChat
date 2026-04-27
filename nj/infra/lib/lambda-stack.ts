import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export type EnvVars = {
  env: string;
  isProd: boolean;
};

export interface LambdaStackProps extends cdk.StackProps {
  envVars: EnvVars;
  userPool: cognito.IUserPool;
}

export class LambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "ExistingVPC", {
      tags: { Name: "VPC-Innov-Platform-*" },
    });

    const { userPool } = props;

    const sg = new ec2.SecurityGroup(this, "ClearUserLambdaSg", {
      vpc,
      description: "Security group for clearUser Lambda",
    });

    const role = new iam.Role(this, "ClearUserLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
      ],
      inlinePolicies: {
        ClearUserPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["secretsmanager:GetSecretValue"],
              resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:ai-assistant/docdb/uri*`],
            }),
            new iam.PolicyStatement({
              actions: ["cognito-idp:ListUsers", "cognito-idp:AdminDeleteUser"],
              resources: [userPool.userPoolArn],
            }),
          ],
        }),
      },
    });

    new NodejsFunction(this, "ClearUserLambda", {
      functionName: "ai-assistant-clear-user",
      entry: path.join(__dirname, "../../lambda/clearUser/index.js"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      role,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [sg],
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_ENV: props.envVars.isProd ? "production" : "development",
        USER_POOL_ID: userPool.userPoolId,
      },
      bundling: {
        format: OutputFormat.CJS,
        commandHooks: {
          afterBundling(_inputDir, outputDir) {
            const pemSrc = path.join(__dirname, "../../lambda/clearUser/global-bundle.pem");
            return [`cp ${pemSrc} ${outputDir}/global-bundle.pem`];
          },
          beforeBundling: () => [],
          beforeInstall: () => [],
        },
      },
    });
  }
}
