/**
 * Microsoft Graph API type definitions
 * Based on Microsoft Graph REST API v1.0 documentation
 */

/**
 * Person type information from Microsoft Graph People API
 */
export interface TGraphPersonType {
  /** Classification of the entity: "Person" or "Group" */
  class: 'Person' | 'Group';
  /** Specific subtype: e.g., "OrganizationUser", "UnifiedGroup" */
  subclass: string;
}

/**
 * Scored email address from Microsoft Graph People API
 */
export interface TGraphScoredEmailAddress {
  /** Email address */
  address: string;
  /** Relevance score (0.0 to 1.0) */
  relevanceScore: number;
}

/**
 * Phone number from Microsoft Graph API
 */
export interface TGraphPhone {
  /** Type of phone number */
  type: string;
  /** Phone number */
  number: string;
}

/**
 * Person/Contact result from Microsoft Graph /me/people endpoint
 */
export interface TGraphPerson {
  /** Unique identifier */
  id: string;
  /** Display name */
  displayName: string;
  /** Given name (first name) */
  givenName?: string;
  /** Surname (last name) */
  surname?: string;
  /** User principal name */
  userPrincipalName?: string;
  /** Job title */
  jobTitle?: string;
  /** Department */
  department?: string;
  /** Company name */
  companyName?: string;
  /** Primary email address */
  mail?: string;
  /** Scored email addresses with relevance */
  scoredEmailAddresses?: TGraphScoredEmailAddress[];
  /** Person type classification */
  personType?: TGraphPersonType;
  /** Phone numbers */
  phones?: TGraphPhone[];
}

/**
 * User result from Microsoft Graph /users endpoint
 */
export interface TGraphUser {
  /** Unique identifier */
  id: string;
  /** Display name */
  displayName: string;
  /** Given name (first name) */
  givenName?: string;
  /** Surname (last name) */
  surname?: string;
  /** User principal name */
  userPrincipalName: string;
  /** Primary email address */
  mail?: string;
  /** Job title */
  jobTitle?: string;
  /** Department */
  department?: string;
  /** Office location */
  officeLocation?: string;
  /** Business phone numbers */
  businessPhones?: string[];
  /** Mobile phone number */
  mobilePhone?: string;
}

/**
 * Group result from Microsoft Graph /groups endpoint
 */
export interface TGraphGroup {
  /** Unique identifier */
  id: string;
  /** Display name */
  displayName: string;
  /** Group email address */
  mail?: string;
  /** Mail nickname */
  mailNickname?: string;
  /** Group description */
  description?: string;
  /** Group types (e.g., ["Unified"] for Microsoft 365 groups) */
  groupTypes?: string[];
  /** Whether group is mail-enabled */
  mailEnabled?: boolean;
  /** Whether group is security-enabled */
  securityEnabled?: boolean;
  /** Resource provisioning options */
  resourceProvisioningOptions?: string[];
}

/**
 * Response wrapper for Microsoft Graph API list endpoints
 */
export interface TGraphListResponse<T> {
  /** Array of results */
  value: T[];
  /** OData context */
  '@odata.context'?: string;
  /** Next page link */
  '@odata.nextLink'?: string;
  /** Count of results (if requested) */
  '@odata.count'?: number;
}

/**
 * Response from /me/people endpoint
 */
export type TGraphPeopleResponse = TGraphListResponse<TGraphPerson>;

/**
 * Response from /users endpoint
 */
export type TGraphUsersResponse = TGraphListResponse<TGraphUser>;

/**
 * Response from /groups endpoint
 */
export type TGraphGroupsResponse = TGraphListResponse<TGraphGroup>;
