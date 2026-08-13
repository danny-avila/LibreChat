export interface ClerkAuthConfigDisabled {
  enabled: false;
}

export interface ClerkAuthConfigEnabled {
  enabled: true;
  publishableKey: string;
  secretKey: string;
  jwtKey: string;
  authorizedParties: readonly string[];
  webhookSigningSecret: string;
}

export type ClerkAuthConfig = ClerkAuthConfigDisabled | ClerkAuthConfigEnabled;

export interface PublicClerkAuthConfig {
  clerkLoginEnabled: boolean;
  clerkPublishableKey?: string;
}
