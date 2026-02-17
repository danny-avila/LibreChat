/**
 * Audit API Client
 * Functions for communicating with audit admin endpoints
 */

import { request } from 'librechat-data-provider';
import type {
  AuditSession,
  AuditListResponse,
  AuditFilters,
  EditReportRequest,
  EditReportResponse,
  ApprovalRequest,
  ApprovalResponse,
  UserListResponse,
  HealthCheckResponse,
} from '~/types/audit';

const BASE_URL = '/api/admin/audits';

/**
 * List audits with optional filters
 */
export const listAudits = async (filters?: AuditFilters): Promise<AuditListResponse> => {
  const params = new URLSearchParams();

  if (filters?.userId) params.append('userId', filters.userId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.approved !== undefined) params.append('approved', String(filters.approved));
  if (filters?.limit) params.append('limit', String(filters.limit));
  if (filters?.offset) params.append('offset', String(filters.offset));

  const url = params.toString() ? `${BASE_URL}?${params.toString()}` : BASE_URL;
  return request.get<AuditListResponse>(url);
};

/**
 * Get audit details by session ID
 */
export const getAuditDetails = async (sessionId: string): Promise<AuditSession> => {
  return request.get<AuditSession>(`${BASE_URL}/${sessionId}`);
};

/**
 * Edit audit report
 */
export const editReport = async (
  sessionId: string,
  reportData: EditReportRequest,
): Promise<EditReportResponse> => {
  if (!reportData.changeNotes || reportData.changeNotes.trim() === '') {
    throw new Error('Change notes are required when editing a report');
  }

  return request.put(`${BASE_URL}/${sessionId}`, reportData) as Promise<EditReportResponse>;
};

/**
 * Approve audit report (sends email to user)
 */
export const approveReport = async (
  sessionId: string,
  data: ApprovalRequest = {},
): Promise<ApprovalResponse> => {
  return request.patch(`${BASE_URL}/${sessionId}/approve`, data) as Promise<ApprovalResponse>;
};

/**
 * List users with search
 */
export const listUsers = async (
  search?: string,
  limit = 50,
  offset = 0,
): Promise<UserListResponse> => {
  const params = new URLSearchParams();

  if (search) params.append('search', search);
  params.append('limit', String(limit));
  params.append('offset', String(offset));

  return request.get<UserListResponse>(`${BASE_URL}/users?${params.toString()}`);
};

/**
 * Health check for audit platform API
 */
export const healthCheck = async (): Promise<HealthCheckResponse> => {
  return request.get<HealthCheckResponse>(`${BASE_URL}/health`);
};
