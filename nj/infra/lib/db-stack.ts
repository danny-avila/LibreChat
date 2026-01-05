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
    envVars: EnvVars
}

export class DatabaseStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: DatabaseStackProps) {
        super(scope, id, props);

        const vpc = ec2.Vpc.fromLookup(this, 'ExistingVPC', {
            tags: {
                'Name': 'VPC-Innov-Platform-*'
            }
        });

        this.CreatePostgresRDSInstance(vpc);
        this.CreateDocumentDBInstance(vpc);
    }

    private CreatePostgresRDSInstance(vpc: ec2.IVpc) {
        const rdsSecurityGroup = new ec2.SecurityGroup(this, "RDSSg", { vpc });
        rdsSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(5432));
        
        const instance = new rds.DatabaseInstance(this, 'VectorDBInstance', {
            engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17_6 }),
            vpc,
            storageType: rds.StorageType.GP3,
            databaseName: "librechat",
            iamAuthentication: true,
            credentials: rds.Credentials.fromGeneratedSecret("librechat"),
            instanceIdentifier: "ai-assistant-prod-db",
            maxAllocatedStorage: 1000,
            multiAz: true,
            vpcSubnets: {
                subnets: vpc.privateSubnets,
            },
            securityGroups: [rdsSecurityGroup]
        });
        
        const secret = instance.secret;
        if (!secret) throw new Error("Expected RDS secret");

        new cdk.CfnOutput(this, "VectorDBArn", {
            value: instance.instanceArn,
            exportName: "VectorDBArn"
        });    
        
        new cdk.CfnOutput(this, "RdsEndpointHostExport", {
            value: instance.dbInstanceEndpointAddress,
            exportName: `${this.stackName}:RdsEndpointHost`,
        });

        new cdk.CfnOutput(this, "RdsEndpointPortExport", {
            value: instance.dbInstanceEndpointPort,
            exportName: `${this.stackName}:RdsEndpointPort`,
        });

        new cdk.CfnOutput(this, "RdsSecretArnExport", {
            value: secret.secretArn,
            exportName: `${this.stackName}:RdsSecretArn`,
        });

        new cdk.CfnOutput(this, "RdsSecurityGroupIdExport", {
            value: rdsSecurityGroup.securityGroupId,
            exportName: `${this.stackName}:RdsSecurityGroupId`,
        });

        return instance.instanceArn;
    }

    private CreateDocumentDBInstance(vpc: ec2.IVpc){
        const docDBSecurityGroup = new ec2.SecurityGroup(this, "DocDBSg", { vpc });
        docDBSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(5432));

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
}
