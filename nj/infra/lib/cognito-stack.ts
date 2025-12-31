import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export type EnvVars = {
    vpcId: string,
    domainName: string,
    env: string, 
}

export interface CognitoStackProps extends cdk.StackProps {
    envVars: EnvVars,
    branding: Record<string, unknown>;
    assets: cognito.CfnManagedLoginBranding.AssetTypeProperty[];
}

export class CognitoStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CognitoStackProps) {
        super(scope, id, props);
        const name_prefix = `nj-ai-assistant-${props.envVars.env}`;
        const callbackUrl = `https://${props.envVars.domainName}/oauth/openid/callback`;
        const logoutUrl = `https://${props.envVars.domainName}/oauth/openid/logout`;

        const userPool = this.createUserPool(props);
        const userPoolClient = this.createUserPoolClient(props, userPool, callbackUrl, logoutUrl);
        this.createManagedLoginBranding(props, userPool, userPoolClient, name_prefix);
    }

    private createUserPool(props: CognitoStackProps) {
        const userPool = new cognito.UserPool(this, "AIAssistantUserPool", {
            userPoolName: "AIAssistantUserPool",
            selfSignUpEnabled: true,
            signInAliases: { email: true, username: true },
            autoVerify: { email: true },
            standardAttributes: {
                givenName: {
                    required: true,
                    mutable: false,
                },
                email: {
                    required: true,
                }
            },
            userVerification: {
                emailSubject: 'Verify your email for NJ AI Assistant!',
                emailBody: 'Hello {username}, Thanks for signing up for NJ AI Assistant! Your verification code is {####}',
                emailStyle: cognito.VerificationEmailStyle.CODE,
                smsMessage: 'Hello {username}, Thanks for signing up to NJ AI Assistant! Your verification code is {####}',
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            mfa: cognito.Mfa.OFF,
        });

        return userPool;
    }

    private createUserPoolClient(props: CognitoStackProps, userPool: cognito.UserPool, callbackUrl: string, logoutUrl: string) {
        const userPoolClient = userPool.addClient("AIAssistantUserPoolClient", {
            userPoolClientName: "AIAssistantUserPoolClient",
            generateSecret: true,
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                    implicitCodeGrant: false,
                },
                scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
                callbackUrls: [callbackUrl],
                logoutUrls: [logoutUrl],
            },
        });
        return userPoolClient;
    }

    private createManagedLoginBranding(props: CognitoStackProps, userPool: cognito.UserPool, userPoolClient: cognito.UserPoolClient, name_prefix: string) {
        new cognito.UserPoolDomain(this, "AIAssistantUserPoolDomain", {
            userPool: userPool,
            managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
            cognitoDomain: {
                domainPrefix: name_prefix,
            },
        });

        new cognito.CfnManagedLoginBranding(this, "AIAssistantUserPoolBranding", {
            userPoolId: userPool.userPoolId,
            clientId: userPoolClient.userPoolClientId,
            useCognitoProvidedValues: false,
            settings: props.branding,
            assets: props.assets ?? [],
        });
    }
}
