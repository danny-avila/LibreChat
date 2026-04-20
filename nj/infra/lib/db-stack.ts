import * as cdk from "aws-cdk-lib";
import * as rds from "aws-cdk-lib/aws-rds"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as docdb from "aws-cdk-lib/aws-docdb"
import * as secrets from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs";

export type EnvVars = {
    domainName: string,
    env: string, 
    isProd: boolean,
}

export interface DatabaseStackProps extends cdk.StackProps {
    envVars: EnvVars,
}

export class DatabaseStack extends cdk.Stack {
    public readonly redisEndpoint: string;
    public readonly redisPort: string;
    public readonly redisSecurityGroup: ec2.ISecurityGroup;
    public readonly rdsEndpoint?: string;
    public readonly rdsPort?: string;
    public readonly rdsSecurityGroup?: ec2.ISecurityGroup;
    public readonly rdsSecret?: secrets.ISecret;

    constructor(scope: Construct, id: string, props: DatabaseStackProps) {
        super(scope, id, props);

        const vpc = ec2.Vpc.fromLookup(this, 'ExistingVPC', {
            tags: {
                'Name': 'VPC-Innov-Platform-*'
            }
        });

        const isProd = props.envVars.isProd;

        // DocumentDB only in prod
        if (isProd) {
            this.CreateDocumentDBInstance(vpc);
        }

        // RDS PostgreSQL only in dev
        if (!isProd) {
            const rds = this.CreateRDSPostgres(vpc);
            this.rdsEndpoint = rds.endpoint;
            this.rdsPort = rds.port;
            this.rdsSecurityGroup = rds.securityGroup;
            this.rdsSecret = rds.secret;
        }

        // Redis in both dev and prod
        const redis = this.CreateElastiCacheRedis(vpc);
        this.redisEndpoint = redis.endpoint;
        this.redisPort = redis.port;
        this.redisSecurityGroup = redis.securityGroup;
    }

    private CreateDocumentDBInstance(vpc: ec2.IVpc){
        const docDBSecurityGroup = new ec2.SecurityGroup(this, "DocDBSg", { vpc });
        docDBSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(27017));

        const cluster = new docdb.DatabaseCluster(this, "DocDB", {
            vpc,
            vpcSubnets: {
                subnets: vpc.privateSubnets,
            },
            serverlessV2ScalingConfiguration: {
                minCapacity: 0.5,
                maxCapacity: 2,
            },
            securityGroup: docDBSecurityGroup,
            masterUser: { username: "Librechat" }
        });

        const secret = cluster.secret;
        if (!secret) throw new Error("Expected DocumentDB secret");

        new cdk.CfnOutput(this, "DocumentDBHostname", {
            value: cluster.clusterEndpoint.hostname,
            exportName: `${this.stackName}:DocumentDBHostname`
        });

        new cdk.CfnOutput(this, "DocDbEndpointPortExport", {
            value: cluster.clusterEndpoint.port.toString(),
            exportName: `${this.stackName}:DocDbEndpointPort`,
        });

        new cdk.CfnOutput(this, "DocDbSecretArnExport", {
            value: cluster.secret.secretArn,
            exportName: `${this.stackName}:DocDbSecretArn`,
        });

        new cdk.CfnOutput(this, "DocDbSecurityGroupIdExport", {
            value: docDBSecurityGroup.securityGroupId,
            exportName: `${this.stackName}:DocDbSecurityGroupId`,
        });

    }

    private CreateRDSPostgres(vpc: ec2.IVpc): { endpoint: string; port: string; securityGroup: ec2.ISecurityGroup; secret: secrets.ISecret } {
        const RDS_PORT = 5432;
        const rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSg", { vpc });
        rdsSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(RDS_PORT));

        const dbInstance = new rds.DatabaseInstance(this, "RagApiRDS", {
            engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15 }),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [rdsSecurityGroup],
            databaseName: "rag_api",
            credentials: rds.Credentials.fromGeneratedSecret("rag_api_user"),
            allocatedStorage: 20,
            maxAllocatedStorage: 100,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            deletionProtection: false,
        });

        new cdk.CfnOutput(this, "RDSEndpointExport", {
            value: dbInstance.dbInstanceEndpointAddress,
        });

        new cdk.CfnOutput(this, "RDSPortExport", {
            value: dbInstance.dbInstanceEndpointPort,
        });

        new cdk.CfnOutput(this, "RDSSecurityGroupIdExport", {
            value: rdsSecurityGroup.securityGroupId,
        });

        if (!dbInstance.secret) {
            throw new Error("Expected RDS secret to be created");
        }

        new cdk.CfnOutput(this, "RDSSecretArnExport", {
            value: dbInstance.secret.secretArn,
        });

        return {
            endpoint: dbInstance.dbInstanceEndpointAddress,
            port: dbInstance.dbInstanceEndpointPort,
            securityGroup: rdsSecurityGroup,
            secret: dbInstance.secret,
        };
    }

    private CreateElastiCacheRedis(vpc: ec2.IVpc): { endpoint: string; port: string; securityGroup: ec2.ISecurityGroup } {
        const REDIS_PORT = 6379;
        const redisSecurityGroup = new ec2.SecurityGroup(this, "RedisSg", { vpc });
        redisSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(REDIS_PORT));

        const subnetGroup = new cdk.aws_elasticache.CfnSubnetGroup(this, "RedisSubnetGroup", {
            description: "Subnet group for ElastiCache Redis",
            subnetIds: vpc.privateSubnets.map((subnet: ec2.ISubnet) => subnet.subnetId),
            cacheSubnetGroupName: "nj-ai-assistant-cache-subnet-group",
        });

        const cache = new cdk.aws_elasticache.CfnServerlessCache(this, "RedisCache", {
            engine: "redis",
            serverlessCacheName: "nj-ai-assistant-cache",
            cacheUsageLimits: {
                dataStorage: {
                    maximum: 10,
                    unit: "GB",
                },
                ecpuPerSecond: {
                    maximum: 5000,
                },
            },
            securityGroupIds: [redisSecurityGroup.securityGroupId],
            subnetIds: vpc.privateSubnets.map((subnet: ec2.ISubnet) => subnet.subnetId),
        });

        cache.addDependency(subnetGroup);

        new cdk.CfnOutput(this, "RedisEndpointExport", {
            value: cache.attrEndpointAddress,
        });

        new cdk.CfnOutput(this, "RedisPortExport", {
            value: cache.attrEndpointPort,
        });

        new cdk.CfnOutput(this, "RedisSecurityGroupIdExport", {
            value: redisSecurityGroup.securityGroupId,
        });

        return {
            endpoint: cache.attrEndpointAddress,
            port: cache.attrEndpointPort,
            securityGroup: redisSecurityGroup,
        };
    }
}
