import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface CognitoStackProps extends cdk.StackProps {
    callback_urls: string[];
    logout_urls: string[];
    branding: Record<string, unknown>;
    assets: cognito.CfnManagedLoginBranding.AssetTypeProperty[];
}

export class CognitoStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CognitoStackProps) {
        super(scope, id, props);
        const name_prefix = "nj-ai-assistant-dev";

        const userPool = this.createUserPool(props);
        const userPoolClient = this.createUserPoolClient(props, userPool);
        this.createManagedLoginBranding(props, userPool, userPoolClient);
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

    private createUserPoolClient(props: CognitoStackProps, userPool: cognito.UserPool) {
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
                callbackUrls: [props.callback_urls[0]],
                logoutUrls: [props.logout_urls[0]],
            },
        });
        return userPoolClient;
    }

    private createManagedLoginBranding(props: CognitoStackProps, userPool: cognito.UserPool, userPoolClient: cognito.UserPoolClient) {
        new cognito.UserPoolDomain(this, "AIAssistantUserPoolDomain", {
            userPool: userPool,
            managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
            cognitoDomain: {
                domainPrefix: "nj-ai-assistant-dev",
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
