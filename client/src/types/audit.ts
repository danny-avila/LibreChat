/**
 * Audit Platform Types
 * Type definitions for audit sessions, reports, and related data
 */

/**
 * Audit session status
 */
export type AuditSessionStatus = 'PAID' | 'COMPLETED' | 'PROCESSED' | 'FAILED';

/**
 * Pain point severity levels
 */
export type PainPointSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Recommendation priority levels
 */
export type RecommendationPriority = 'low' | 'medium' | 'high';

/**
 * Implementation complexity levels
 */
export type ImplementationComplexity = 'easy' | 'moderate' | 'complex';

/**
 * User associated with an audit session
 */
export interface AuditUser {
  id: string;
  email: string;
  name: string | null;
  createdAt?: string;
  emailVerified?: string | null;
  _count?: {
    auditSessions: number;
  };
}

/**
 * Pain point in audit report
 */
export interface PainPoint {
  category: string;
  title: string;
  description: string;
  severity: PainPointSeverity;
  current_time_spent: string;
  business_impact: string;
}

/**
 * Recommendation in audit report
 */
export interface Recommendation {
  title: string;
  description: string;
  priority: RecommendationPriority;
  implementation_complexity: ImplementationComplexity;
  estimated_timeline: string;
  expected_impact: string;
  tools_or_approaches: string[];
}

/**
 * Estimated ROI for audit recommendations
 */
export interface EstimatedROI {
  hours_saved: string;
  cost_equivalent: string;
  additional_notes?: string;
}

/**
 * Report version (for edit history)
 */
export interface ReportVersion {
  versionNumber: number;
  editedBy: string;
  editedAt: string;
  changeNotes: string;
  content: Partial<AuditReport>;
}

/**
 * Audit report (attached to session after processing)
 */
export interface AuditReport {
  id: string;
  sessionId: string;
  approved: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  executiveSummary: string;
  painPoints: PainPoint[];
  recommendations: Recommendation[];
  quickWins: string[];
  longTermInitiatives: string[];
  estimatedROI: EstimatedROI;
  versions?: ReportVersion[];
}

/**
 * Audit session (main entity)
 */
export interface AuditSession {
  id: string;
  userId: string;
  status: AuditSessionStatus;
  createdAt: string;
  updatedAt: string;
  user: AuditUser;
  report?: AuditReport;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * List audits response
 */
export interface AuditListResponse {
  audits: AuditSession[];
  pagination: PaginationMeta;
}

/**
 * List users response
 */
export interface UserListResponse {
  users: AuditUser[];
  pagination: PaginationMeta;
}

/**
 * Filters for listing audits
 */
export interface AuditFilters {
  userId?: string;
  status?: AuditSessionStatus;
  approved?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Request body for editing a report
 */
export interface EditReportRequest {
  executiveSummary?: string;
  painPoints?: PainPoint[];
  recommendations?: Recommendation[];
  quickWins?: string[];
  longTermInitiatives?: string[];
  estimatedROI?: EstimatedROI;
  changeNotes: string; // Required
}

/**
 * Response from editing a report
 */
export interface EditReportResponse {
  success: boolean;
  reportId: string;
  versionNumber: number;
  message?: string;
}

/**
 * Request body for approving a report
 */
export interface ApprovalRequest {
  message?: string;
}

/**
 * Response from approving a report
 */
export interface ApprovalResponse {
  success: boolean;
  reportId: string;
  emailSent: boolean;
  message: string;
  error?: string;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  healthy: boolean;
  service: string;
  configured: boolean;
  error?: string;
}

/**
 * API error response
 */
export interface AuditAPIError {
  error: string;
  message: string;
  details?: any;
  featureRequested?: string;
  businessName?: string;
  enabledFeatures?: string[];
  missingConfiguration?: string[];
}
