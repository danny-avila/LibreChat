export type FieldErrors = {
  email?: string;
  password?: string;
};

export type AuthStep = 'login' | '2fa';

export interface AuthCardProps {
  redirectTo?: string;
  autoRedirectSso?: boolean;
  ssoAvailable?: boolean;
}
