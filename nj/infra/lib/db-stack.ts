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
