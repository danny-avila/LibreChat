import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as acm from "aws-cdk-lib/aws-certificatemanager"
import * as secrets from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs";

export type EnvVars = {
  domainName: string,
  env: string,
  isProd: boolean
}

export interface EcsServicesProps extends cdk.StackProps {
  envVars: EnvVars,
  mongoImage: string;
  postgresImage: string;
  certificateArn: string; 
}

export class EcsStack extends cdk.Stack {
  public readonly listener: elbv2.ApplicationListener;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly service: ecsPatterns.ApplicationLoadBalancedFargateService;
  public readonly s3Bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: EcsServicesProps) {
    super(scope, id, props);
    const vpc = ec2.Vpc.fromLookup(this, 'ExistingVpc', {
      tags: {
          'Name': 'VPC-Innov-Platform-*'
      }
    });
    const isProd = props.envVars.env.includes("prod")

    this.CreateVPCEndpoints(isProd, vpc);
    const cluster = this.CreateCluster(vpc);
    this.s3Bucket = this.CreateFileS3Bucket();
    const commonExecRole = this.CreateCommonExecRole(isProd);

    const librechatService = this.CreateLibrechatService(props, cluster, commonExecRole, isProd);
    this.listener = librechatService.listener;
    this.loadBalancer = librechatService.loadBalancer;
    this.service = librechatService;

    if (!isProd) {
      this.CreateDatabaseSidecars(props, commonExecRole, vpc, cluster, librechatService)
    }
  }

  private CreateVPCEndpoints(isProd: boolean, vpc: ec2.IVpc) {
    const endpointsSg = new ec2.SecurityGroup(this, "VpcEndpointsSg", { vpc });
    endpointsSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(27017));
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
    if (isProd) {
      vpc.addInterfaceEndpoint("RdsEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.RDS,
        securityGroups: [endpointsSg],
      });
    }
  };

  private CreateCluster(vpc: ec2.IVpc) {
    const cluster = new ecs.Cluster(this, "AIAssistantCluster", {
      vpc,
      clusterName: "ai-assistant-cluster",
    });
    cluster.addDefaultCloudMapNamespace({ name: "internal" });

    return cluster;
  };

  private CreateCommonExecRole(isProd: boolean) {
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
    commonExecRole.attachInlinePolicy( new iam.Policy(this, 'fileBucketPolicy', {
      statements: [new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [this.s3Bucket.bucketArn, `${this.s3Bucket.bucketArn}/*`]
      })]
    }))
    if (isProd) {
      commonExecRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonRDSFullAccess")
      );
      commonExecRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonDocDBFullAccess")
      );
    }
    return commonExecRole;
  };

  private CreateLibrechatService(props: EcsServicesProps, cluster: ecs.Cluster, commonExecRole: iam.Role, isProd: boolean) {
    const docdbSecret = secrets.Secret.fromSecretNameV2(this, "DocdbSecret", "ai-assistant/docdb/uri");
    const librechatTag = isProd ? ssm.StringParameter.valueForStringParameter(this, '/ai-assistant/prod-image-tag') : "latest";
    const librechatImage = `${this.account}.dkr.ecr.${this.region}.amazonaws.com/newjersey/librechat:${librechatTag}`;

    const librechatTaskDef = new ecs.FargateTaskDefinition(this, "LibreChatTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole: commonExecRole,
      taskRole: commonExecRole,
    });

    const environment: Record<string, string> = {
      NODE_ENV: "production",
      PORT: "3080",
      HOST: "0.0.0.0",
      LOG_LEVEL: "info",
      MEILI_HOST: "http://rag_api.internal:7700",
      RAG_API_URL: "http://rag_api.internal:8000",
      CONFIG_PATH: "/app/nj/nj-librechat.yaml",
      AWS_BUCKET_NAME: this.s3Bucket.bucketName,
      AWS_REGION: this.region,

      // Apply empty custom footer in ECS definition (instead of .env file)
      // Can move back to .env if resolved: https://github.com/aws/containers-roadmap/issues/1354
      CUSTOM_FOOTER: "",

      ...(!isProd ? { MONGO_URI: "mongodb://mongodb.internal:27017/LibreChat" } : {}),
    };

    const envSecrets: Record<string, ecs.Secret> = {
      ...(isProd ? { MONGO_URI: ecs.Secret.fromSecretsManager(docdbSecret, "uri") } : {}),
    };

    librechatTaskDef.addContainer("librechat", {
      image: ecs.ContainerImage.fromRegistry(librechatImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "librechat" }),
      cpu: 512,
      memoryLimitMiB: 1024,
      environment: environment,
      secrets: envSecrets,
      environmentFiles: [
        ecs.EnvironmentFile.fromBucket(s3.Bucket.fromBucketArn(this, "EnvFilesBucket", "arn:aws:s3:::nj-librechat-env-files"), `${props.envVars.env}.env`),
      ],
      portMappings: [{ containerPort: 3080 }],
      command: ["npm", "run", "backend"],
    });

    // Re-enable when OIT does load balancer things
    const aiAssistantCertificate = acm.Certificate.fromCertificateArn(this, 'aiAssistantCertificate', props.certificateArn);

    const librechatService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "LibreChatFargateService",
      {
        cluster,
        desiredCount: 1,
        minHealthyPercent: 50,
        taskDefinition: librechatTaskDef,
        enableExecuteCommand: true,
        publicLoadBalancer: false,
        listenerPort: 443, 
        taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        certificate: aiAssistantCertificate,
      }
    );
    const scalableTarget = librechatService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 20,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
    });

    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 50,
    });

    new cdk.CfnOutput(this, "LibrechatImageUri", { value: librechatImage });
    return librechatService;
  };

  private CreateDatabaseSidecars(props: EcsServicesProps, commonExecRole: iam.Role, vpc: ec2.IVpc, cluster: ecs.Cluster, librechatService: ecsPatterns.ApplicationLoadBalancedFargateService) {
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
      image: ecs.ContainerImage.fromRegistry(props.mongoImage),
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
      enableExecuteCommand: true,
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
      image: ecs.ContainerImage.fromRegistry(props.postgresImage),
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
      enableExecuteCommand: true,
      cloudMapOptions: { name: "vectordb" },
      securityGroups: [pgSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    mongoService.connections.allowFrom(librechatService.service, ec2.Port.tcp(27017), "App to MongoDB");
    vectordbService.connections.allowFrom(librechatService.service, ec2.Port.tcp(5432), "App to Postgres");

    mongoFs.connections.allowDefaultPortFrom(mongoService);
    pgFs.connections.allowDefaultPortFrom(vectordbService);

    new cdk.CfnOutput(this, "MongoImageUri", { value: props.mongoImage });
    new cdk.CfnOutput(this, "PostgresImageUri", { value: props.postgresImage });
  }

  private CreateFileS3Bucket(){
    const lifecycleRule: s3.LifecycleRule = {
      enabled: true,
      expiration: cdk.Duration.days(1),
      prefix: "tmp/",
    }

    const s3Bucket = new s3.Bucket(this, 'LibrechatFileBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [lifecycleRule],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    return s3Bucket;
  }
}

