import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";

export type EnvVars = {
    vpcId: string,
    domainName: string,
    env: string, 
}

export interface EcsServicesProps extends cdk.StackProps {
  envVars: EnvVars,
  librechatImage: string;
  mongoImage: string;
  postgresImage: string;
  certificateArn: string;
}

export class EcsStack extends cdk.Stack {
  public readonly listener: elbv2.ApplicationListener;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsServicesProps) {
    super(scope, id, props);
    const vpc = ec2.Vpc.fromLookup(this, "ExistingVpc", {
      vpcId: props.envVars.vpcId,
    });
    const librechatImage = props.librechatImage;
    const mongoImage = props.mongoImage;
    const postgresImage = props.postgresImage;

    const endpointsSg = new ec2.SecurityGroup(this, "VpcEndpointsSg", { vpc });
    vpc.addInterfaceEndpoint("EcrDockerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      securityGroups: [endpointsSg],
    });
    vpc.addInterfaceEndpoint("EcrApiEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      securityGroups: [endpointsSg],
    });
    vpc.addInterfaceEndpoint("CloudWatchLogsEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      securityGroups: [endpointsSg],
    });
    vpc.addInterfaceEndpoint("BedrockRuntimeEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      securityGroups: [endpointsSg],
    });    
    vpc.addInterfaceEndpoint("CognitoEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.COGNITO_IDP,
      securityGroups: [endpointsSg],
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        availabilityZones: ['us-east-1a']
  }
    });
    vpc.addGatewayEndpoint("S3GatewayEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    
    const cluster = new ecs.Cluster(this, "AIAssistantCluster", {
      vpc,
      clusterName: "ai-assistant-cluster",
    });
    cluster.addDefaultCloudMapNamespace({ name: "internal" });

    // Shared execution role for all task definitions
    const commonExecRole = new iam.Role(this, "CommonTaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Execution role for pulling ECR images and writing logs",
    });
    commonExecRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
    );
    commonExecRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
    );

    // Create LibreChat task definition using the shared execution role
    const librechatTaskDef = new ecs.FargateTaskDefinition(this, "LibreChatTaskDef", {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: commonExecRole,
    });

    librechatTaskDef.addContainer("librechat", {
      image: ecs.ContainerImage.fromRegistry(librechatImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "librechat" }),
      environment: {
        NODE_ENV: "production",
        PORT: "3080",
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        MONGO_URI: "mongodb://mongodb.internal:27017/LibreChat",
        MEILI_HOST: "http://rag_api.internal:7700",
        RAG_API_URL: "http://rag_api.internal:8000",
        CONFIG_PATH: "/app/nj/nj-librechat.yaml",
      },
      environmentFiles: [
        ecs.EnvironmentFile.fromBucket(s3.Bucket.fromBucketArn(this, "EnvFilesBucket", "arn:aws:s3:::nj-librechat-env-files"), `${props.envVars.env}.env`),
      ],
      portMappings: [{ containerPort: 3080 }],
      command: ["npm","run","backend"], 
    });
    
    const aiAssistantCertificate = acm.Certificate.fromCertificateArn(this, 'aiAssistantCertificate', props.certificateArn);

    const librechatService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "LibreChatFargateService",
      {
        cluster,
        desiredCount: 1,
        taskDefinition: librechatTaskDef,
        publicLoadBalancer: false,
        listenerPort: 80, // change to 443 when OIT is done with imperva
        taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        // certificate: aiAssistantCertificate, // uncomment when OIT is done with imperva
      }
    );
    this.listener = librechatService.listener;
    this.loadBalancer = librechatService.loadBalancer;
    this.service = librechatService.service;

    const mongoFs = new efs.FileSystem(this, "MongoFs", {
      vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encrypted: true,
    });

    const mongoTaskDef = new ecs.FargateTaskDefinition(this, "MongoTaskDef", {
      cpu: 256,
      memoryLimitMiB: 1024,
      executionRole: commonExecRole,
    });

    mongoTaskDef.addVolume({
      name: "mongoData",
      efsVolumeConfiguration: {
        fileSystemId: mongoFs.fileSystemId,
        transitEncryption: "ENABLED",
      },
    });

    const mongoContainer = mongoTaskDef.addContainer("mongodb", {
      image: ecs.ContainerImage.fromRegistry(mongoImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "mongodb" }),
      command: ["mongod", "--noauth"],
      portMappings: [{ containerPort: 27017 }],
    });
    mongoContainer.addMountPoints({
      sourceVolume: "mongoData",
      containerPath: "/data/db",
      readOnly: false,
    });

    const mongoSg = new ec2.SecurityGroup(this, "MongoSg", { vpc });
    const mongoService = new ecs.FargateService(this, "MongoService", {
      cluster,
      taskDefinition: mongoTaskDef,
      desiredCount: 1,
      cloudMapOptions: { name: "mongodb" },
      securityGroups: [mongoSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    const pgFs = new efs.FileSystem(this, "PgFs", {
      vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encrypted: true,
    });

    const pgTaskDef = new ecs.FargateTaskDefinition(this, "VectorDbTaskDef", {
      cpu: 256,
      memoryLimitMiB: 1024,
      executionRole: commonExecRole,
    });

    pgTaskDef.addVolume({
      name: "pgData",
      efsVolumeConfiguration: {
        fileSystemId: pgFs.fileSystemId,
        transitEncryption: "ENABLED",
      },
    });

    const pgContainer = pgTaskDef.addContainer("vectordb", {
      image: ecs.ContainerImage.fromRegistry(postgresImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "vectordb" }),
      environment: {
        POSTGRES_DB: "mydatabase",
        POSTGRES_USER: "myuser",
        POSTGRES_PASSWORD: "mypassword",
      },
      portMappings: [{ containerPort: 5432 }],
    });
    pgContainer.addMountPoints({
      sourceVolume: "pgData",
      containerPath: "/var/lib/postgresql/data",
      readOnly: false,
    });

    const pgSg = new ec2.SecurityGroup(this, "PgSg", { vpc });
    const vectordbService = new ecs.FargateService(this, "VectorDbService", {
      cluster,
      taskDefinition: pgTaskDef,
      desiredCount: 1,
      cloudMapOptions: { name: "vectordb" },
      securityGroups: [pgSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    mongoService.connections.allowFrom(librechatService.service, ec2.Port.tcp(27017), "App to MongoDB");
    vectordbService.connections.allowFrom(librechatService.service, ec2.Port.tcp(5432), "App to Postgres");

    mongoFs.connections.allowDefaultPortFrom(mongoService);
    pgFs.connections.allowDefaultPortFrom(vectordbService);

    new cdk.CfnOutput(this, "LibrechatImageUri", { value: librechatImage });
    new cdk.CfnOutput(this, "MongoImageUri", { value: mongoImage });
    new cdk.CfnOutput(this, "PostgresImageUri", { value: postgresImage });
  }
}
