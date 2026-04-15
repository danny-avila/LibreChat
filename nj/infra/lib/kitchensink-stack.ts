import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

const DOMAIN = "kitchensink.ai-assistant.nj.gov";
const ENV_FILE_KEY = "librechat.env";
const ENV_FILES_BUCKET_ARN = "arn:aws:s3:::nj-librechat-env-files";

export interface KitchenSinkStackProps extends cdk.StackProps {
  listenerArn: string;
  loadBalancerSecurityGroupId: string;
  certificateArn: string;
}

export class KitchenSinkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: KitchenSinkStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "ExistingVpc", {
      tags: { Name: "VPC-Innov-Platform-*" },
    });

    const cluster = this.createCluster(vpc);
    const fileBucket = this.createFileBucket();
    const execRole = this.createExecRole(fileBucket);
    const envBucket = s3.Bucket.fromBucketArn(this, "EnvFilesBucket", ENV_FILES_BUCKET_ARN);

    const lbSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, "ImportedLbSg", props.loadBalancerSecurityGroupId);
    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, "ImportedListener", {
      listenerArn: props.listenerArn,
      securityGroup: lbSecurityGroup,
    });

    const mongoService = this.createMongoService(vpc, cluster, execRole);
    const vectorDbService = this.createVectorDbService(vpc, cluster, execRole);
    const meiliService = this.createMeiliSearchService(vpc, cluster, execRole, envBucket);
    const ollamaService = this.createOllamaService(vpc, cluster, execRole);
    const ragApiService = this.createRagApiService(cluster, execRole, envBucket);
    const librechatService = this.createLibrechatService(
      vpc, cluster, execRole,
      listener, props.certificateArn,
      envBucket, fileBucket,
    );

    mongoService.connections.allowFrom(librechatService, ec2.Port.tcp(27017), "LibreChat to MongoDB");
    vectorDbService.connections.allowFrom(ragApiService, ec2.Port.tcp(5432), "RAG API to VectorDB");
    meiliService.connections.allowFrom(librechatService, ec2.Port.tcp(7700), "LibreChat to MeiliSearch");
    meiliService.connections.allowFrom(ragApiService, ec2.Port.tcp(7700), "RAG API to MeiliSearch");
    ollamaService.connections.allowFrom(ragApiService, ec2.Port.tcp(11434), "RAG API to Ollama");
    ollamaService.connections.allowFrom(librechatService, ec2.Port.tcp(11434), "LibreChat to Ollama");
    ragApiService.connections.allowFrom(librechatService, ec2.Port.tcp(8000), "LibreChat to RAG API");
    librechatService.connections.allowFrom(lbSecurityGroup, ec2.Port.tcp(3080), "ALB to LibreChat");
    librechatService.connections.allowFrom(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(3080), "Health checks to LibreChat");

    // Explicitly add egress rule to ALB security group (imported, so allowFrom doesn't add egress)
    new ec2.CfnSecurityGroupEgress(this, "AlbToKitchenSinkEgress", {
      groupId: lbSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 3080,
      toPort: 3080,
      destinationSecurityGroupId: librechatService.connections.securityGroups[0].securityGroupId,
      description: "ALB to KitchenSink LibreChat",
    });
  }

  private createCluster(vpc: ec2.IVpc): ecs.Cluster {
    const cluster = new ecs.Cluster(this, "KitchensinkCluster", {
      vpc,
      clusterName: "kitchensink-cluster",
    });
    cluster.addDefaultCloudMapNamespace({ name: "kitchensink" });
    return cluster;
  }

  private createFileBucket(): s3.Bucket {
    return new s3.Bucket(this, "KitchenSinkFileBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ enabled: true, expiration: cdk.Duration.days(1) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }

  private createExecRole(fileBucket: s3.Bucket): iam.Role {
    const role = new iam.Role(this, "KitchenSinkExecRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Execution and task role for LibreChat public stack",
    });
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
    );
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess"),
    );
    role.attachInlinePolicy(new iam.Policy(this, "FileBucketPolicy", {
      statements: [new iam.PolicyStatement({
        actions: ["s3:*"],
        resources: [fileBucket.bucketArn, `${fileBucket.bucketArn}/*`],
      })],
    }));
    return role;
  }

  private createMongoService(vpc: ec2.IVpc, cluster: ecs.Cluster, execRole: iam.Role): ecs.FargateService {
    const mongoFs = new efs.FileSystem(this, "MongoFs", {
      vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encrypted: true,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, "MongoTaskDef", {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: execRole,
    });
    taskDef.addVolume({
      name: "mongoData",
      efsVolumeConfiguration: { fileSystemId: mongoFs.fileSystemId, transitEncryption: "ENABLED" },
    });

    const container = taskDef.addContainer("mongodb", {
      image: ecs.ContainerImage.fromRegistry(`${this.account}.dkr.ecr.${this.region}.amazonaws.com/newjersey/mongo:8.0.17`),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "lc-mongodb" }),
      command: ["mongod", "--noauth"],
      portMappings: [{ containerPort: 27017 }],
    });
    container.addMountPoints({ sourceVolume: "mongoData", containerPath: "/data/db", readOnly: false });

    const service = new ecs.FargateService(this, "MongoService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      enableExecuteCommand: true,
      cloudMapOptions: { name: "mongodb" },
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    mongoFs.connections.allowDefaultPortFrom(service);
    return service;
  }

  private createVectorDbService(vpc: ec2.IVpc, cluster: ecs.Cluster, execRole: iam.Role): ecs.FargateService {
    const pgFs = new efs.FileSystem(this, "VectorDbFs", {
      vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encrypted: true,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, "VectorDbTaskDef", {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: execRole,
    });
    taskDef.addVolume({
      name: "pgData",
      efsVolumeConfiguration: { fileSystemId: pgFs.fileSystemId, transitEncryption: "ENABLED" },
    });

    const container = taskDef.addContainer("vectordb", {
      image: ecs.ContainerImage.fromRegistry(`${this.account}.dkr.ecr.${this.region}.amazonaws.com/newjersey/pgvector:0.8.0-pg15-trixie`),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "lc-vectordb" }),
      environment: {
        POSTGRES_DB: "mydatabase",
        POSTGRES_USER: "myuser",
        POSTGRES_PASSWORD: "mypassword",
      },
      portMappings: [{ containerPort: 5432 }],
    });
    container.addMountPoints({ sourceVolume: "pgData", containerPath: "/var/lib/postgresql/data", readOnly: false });

    const service = new ecs.FargateService(this, "VectorDbService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      enableExecuteCommand: true,
      cloudMapOptions: { name: "vectordb" },
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    pgFs.connections.allowDefaultPortFrom(service);
    return service;
  }

  private createMeiliSearchService(
    vpc: ec2.IVpc,
    cluster: ecs.Cluster,
    execRole: iam.Role,
    envBucket: s3.IBucket,
  ): ecs.FargateService {
    const meiliFs = new efs.FileSystem(this, "MeiliFs", {
      vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encrypted: true,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, "MeiliTaskDef", {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: execRole,
    });
    taskDef.addVolume({
      name: "meiliData",
      efsVolumeConfiguration: { fileSystemId: meiliFs.fileSystemId, transitEncryption: "ENABLED" },
    });

    const container = taskDef.addContainer("meilisearch", {
      image: ecs.ContainerImage.fromRegistry(`${this.account}.dkr.ecr.${this.region}.amazonaws.com/newjersey/meilisearch:v1.35.1`),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "lc-meilisearch" }),
      environment: { MEILI_NO_ANALYTICS: "true" },
      environmentFiles: [ecs.EnvironmentFile.fromBucket(envBucket, ENV_FILE_KEY)],
      portMappings: [{ containerPort: 7700 }],
    });
    container.addMountPoints({ sourceVolume: "meiliData", containerPath: "/meili_data", readOnly: false });

    const service = new ecs.FargateService(this, "MeiliService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      enableExecuteCommand: true,
      cloudMapOptions: { name: "meilisearch" },
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    meiliFs.connections.allowDefaultPortFrom(service);
    return service;
  }

  private createOllamaService(vpc: ec2.IVpc, cluster: ecs.Cluster, execRole: iam.Role): ecs.FargateService {
    const ollamaFs = new efs.FileSystem(this, "OllamaFs", {
      vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encrypted: true,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, "OllamaTaskDef", {
      cpu: 1024,
      memoryLimitMiB: 2048,
      executionRole: execRole,
    });
    taskDef.addVolume({
      name: "ollamaData",
      efsVolumeConfiguration: { fileSystemId: ollamaFs.fileSystemId, transitEncryption: "ENABLED" },
    });

    const container = taskDef.addContainer("ollama", {
      image: ecs.ContainerImage.fromRegistry(`${this.account}.dkr.ecr.${this.region}.amazonaws.com/newjersey/ollama:latest`),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "lc-ollama" }),
      portMappings: [{ containerPort: 11434 }],
    });
    container.addMountPoints({ sourceVolume: "ollamaData", containerPath: "/root/.ollama", readOnly: false });

    const service = new ecs.FargateService(this, "OllamaService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      enableExecuteCommand: true,
      cloudMapOptions: { name: "ollama" },
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    ollamaFs.connections.allowDefaultPortFrom(service);
    return service;
  }

  private createRagApiService(
    cluster: ecs.Cluster,
    execRole: iam.Role,
    envBucket: s3.IBucket,
  ): ecs.FargateService {
    const ragTaskRole = new iam.Role(this, "RagApiTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Task role for RAG API to access Bedrock",
    });

    ragTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`,
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
      ],
    }));

    const taskDef = new ecs.FargateTaskDefinition(this, "RagApiTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole: execRole,
      taskRole: ragTaskRole,
    });

    taskDef.addContainer("rag_api", {
      image: ecs.ContainerImage.fromRegistry(`${this.account}.dkr.ecr.${this.region}.amazonaws.com/newjersey/rag-api:latest`),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "lc-rag-api" }),
      environment: {
        DB_HOST: "vectordb.kitchensink",
        RAG_PORT: "8000",
        MEILI_HOST: "http://meilisearch.kitchensink:7700",
        EMBEDDINGS_PROVIDER: "bedrock",
        OLLAMA_BASE_URL: "http://ollama.kitchensink:11434",
        EMBEDDINGS_MODEL: "amazon.titan-embed-text-v1",
      },
      environmentFiles: [ecs.EnvironmentFile.fromBucket(envBucket, ENV_FILE_KEY)],
      portMappings: [{ containerPort: 8000 }],
    });

    return new ecs.FargateService(this, "RagApiService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      enableExecuteCommand: true,
      cloudMapOptions: { name: "rag-api" },
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });
  }

  private createLibrechatService(
    vpc: ec2.IVpc,
    cluster: ecs.Cluster,
    execRole: iam.Role,
    listener: elbv2.IApplicationListener,
    certificateArn: string,
    envBucket: s3.IBucket,
    fileBucket: s3.Bucket,
  ): ecs.FargateService {
    const taskDef = new ecs.FargateTaskDefinition(this, "KitchenSinkTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole: execRole,
      taskRole: execRole,
    });

    taskDef.addContainer("librechat", {
      image: ecs.ContainerImage.fromRegistry(`${this.account}.dkr.ecr.${this.region}.amazonaws.com/newjersey/librechat-dev:latest`),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "lc-librechat" }),
      environment: {
        NODE_ENV: "production",
        PORT: "3080",
        HOST: "0.0.0.0",
        MONGO_URI: "mongodb://mongodb.kitchensink:27017/LibreChat",
        MEILI_HOST: "http://meilisearch.kitchensink:7700",
        RAG_API_URL: "http://rag-api.kitchensink:8000",
        EMBEDDINGS_PROVIDER: "bedrock",
        OLLAMA_BASE_URL: "http://ollama.kitchensink:11434",
        EMBEDDINGS_MODEL: "amazon.titan-embed-text-v1",
        AWS_BUCKET_NAME: fileBucket.bucketName,
        AWS_REGION: this.region,
      },
      environmentFiles: [ecs.EnvironmentFile.fromBucket(envBucket, ENV_FILE_KEY)],
      portMappings: [{ containerPort: 3080 }],
      command: ["npm", "run", "backend"],
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, "KitchenSinkTg", {
      vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        path: "/",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: "200-399",
      },
    });

    const cert = acm.Certificate.fromCertificateArn(this, "KitchenSinkCert", certificateArn);
    listener.addCertificates("KitchenSinkCert", [cert]);
    listener.addAction("KitchenSinkRule", {
      conditions: [elbv2.ListenerCondition.hostHeaders([DOMAIN])],
      priority: 10,
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    const service = new ecs.FargateService(this, "KitchenSinkService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      minHealthyPercent: 50,
      enableExecuteCommand: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    service.attachToApplicationTargetGroup(targetGroup);

    const scalableTarget = service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 10 });
    scalableTarget.scaleOnCpuUtilization("CpuScaling", { targetUtilizationPercent: 50 });
    scalableTarget.scaleOnMemoryUtilization("MemoryScaling", { targetUtilizationPercent: 50 });

    new cdk.CfnOutput(this, "KitchenSinkImageUri", {
      value: `${this.account}.dkr.ecr.${this.region}.amazonaws.com/newjersey/librechat-dev:latest`,
    });

    return service;
  }
}
