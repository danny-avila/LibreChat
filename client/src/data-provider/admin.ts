/**
 * Admin Dashboard API Client
 * 
 * This file contains API client functions for the Admin Reporting Dashboard.
 * These functions handle all HTTP requests to the admin dashboard endpoints.
 */

import axios from 'axios';
import type {
  DashboardOverview,
  UserMetrics,
  ConversationMetrics,
  TokenMetrics,
  MessageMetrics,
  SystemHealthMetrics,
  TimeRangeParams,
  ExportParams,
} from '~/types/admin';

// Base URL for admin endpoints
const ADMIN_BASE_URL = '/api/admin/dashboard';

/**
 * Build query string from parameters
 */
const buildQueryString = (params: TimeRangeParams): string => {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `?${query}` : '';
};

/**
 * Get the Authorization header from axios defaults (set by setTokenHeader)
 * This extracts the token from the "Bearer <token>" format
 */
function getTokenFromAxiosDefaults(): string | null {
  const authHeader = axios.defaults.headers.common['Authorization'] as string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7); // Remove "Bearer " prefix
  }
  return null;
}

/**
 * Generic fetch wrapper with error handling and token refresh support
 */
async function fetchWithAuth<T>(url: string, options?: RequestInit): Promise<T> {
  const makeRequest = async (): Promise<Response> => {
    // Get the token from axios defaults (set by setTokenHeader in AuthContext)
    const token = getTokenFromAxiosDefaults();
    
    // Build headers with Authorization if token exists
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };
    
    // Add Authorization header if token is available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include cookies for authentication
    });
  };

  try {
    console.log('[Admin API] Making request to:', url);
    let response = await makeRequest();
    console.log('[Admin API] Response status:', response.status, 'for:', url);

    // If 401, token might be expired - wait a bit and retry once
    // (other parts of the app will trigger token refresh)
    if (response.status === 401) {
      console.log('[Admin API] Got 401, waiting 500ms before retry for:', url);
      // Wait 500ms for token refresh to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('[Admin API] Retrying request to:', url);
      // Retry the request
      response = await makeRequest();
      console.log('[Admin API] Retry response status:', response.status, 'for:', url);
      
      // If still 401 after retry, authentication has truly failed
      if (response.status === 401) {
        console.log('[Admin API] Still 401 after retry, redirecting to login');
        window.location.href = '/login';
        throw new Error('Authentication required');
      }
    }

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Access denied. Administrator privileges required.');
      } else if (response.status === 429) {
        throw new Error('Too many requests. Please wait a moment.');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch data');
      }
    }

    console.log('[Admin API] Success for:', url);
    return response.json();
  } catch (error) {
    console.error('[Admin API] Error for:', url, error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred');
  }
}

/**
 * Fetch overview metrics for the dashboard
 * 
 * @returns Promise<DashboardOverview> - Overview metrics including users, conversations, messages, tokens, and system health
 */
export async function fetchOverviewMetrics(): Promise<DashboardOverview> {
  const url = `${ADMIN_BASE_URL}/overview`;
  return fetchWithAuth<DashboardOverview>(url);
}

/**
 * Fetch user metrics with optional time range filtering
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise<UserMetrics> - User analytics including total users, active users, new users, auth breakdown, and top users
 */
export async function fetchUserMetrics(params?: TimeRangeParams): Promise<UserMetrics> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/users${queryString}`;
  return fetchWithAuth<UserMetrics>(url);
}

/**
 * Fetch conversation metrics with optional time range filtering
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise<ConversationMetrics> - Conversation analytics including totals, time series, endpoint breakdown, and length distribution
 */
export async function fetchConversationMetrics(
  params?: TimeRangeParams,
): Promise<ConversationMetrics> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/conversations${queryString}`;
  return fetchWithAuth<ConversationMetrics>(url);
}

/**
 * Fetch token usage metrics with optional time range filtering
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise<TokenMetrics> - Token analytics including consumption, costs, balance stats, and cache stats
 */
export async function fetchTokenMetrics(params?: TimeRangeParams): Promise<TokenMetrics> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/tokens${queryString}`;
  return fetchWithAuth<TokenMetrics>(url);
}

/**
 * Fetch message metrics with optional time range filtering
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise<MessageMetrics> - Message analytics including totals, time series, type breakdown, and error rates
 */
export async function fetchMessageMetrics(params?: TimeRangeParams): Promise<MessageMetrics> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/messages${queryString}`;
  return fetchWithAuth<MessageMetrics>(url);
}

/**
 * Fetch system health metrics
 * 
 * @returns Promise<SystemHealthMetrics> - System health indicators including response times, error rates, cache stats, and database performance
 */
export async function fetchSystemHealthMetrics(): Promise<SystemHealthMetrics> {
  const url = `${ADMIN_BASE_URL}/system-health`;
  return fetchWithAuth<SystemHealthMetrics>(url);
}

/**
 * Fetch model usage analytics
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise with model usage analytics including distribution, trends, and performance
 */
export async function fetchModelUsageMetrics(params?: TimeRangeParams): Promise<any> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/models${queryString}`;
  return fetchWithAuth<any>(url);
}

/**
 * Fetch balance and credits analytics
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise with balance analytics including distribution, refill activity, and low balance users
 */
export async function fetchBalanceMetrics(params?: TimeRangeParams): Promise<any> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/balance${queryString}`;
  return fetchWithAuth<any>(url);
}

/**
 * Fetch error and failure analytics
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise with error analytics including error rates, trends, and success rates by endpoint
 */
export async function fetchErrorMetrics(params?: TimeRangeParams): Promise<any> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/errors${queryString}`;
  return fetchWithAuth<any>(url);
}

/**
 * Fetch file upload analytics
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise with file upload analytics including totals, types, storage usage, and top users
 */
export async function fetchFileUploadMetrics(params?: TimeRangeParams): Promise<any> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/files${queryString}`;
  return fetchWithAuth<any>(url);
}

/**
 * Fetch user engagement analytics
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise with user engagement analytics including retention, session length, churn, and power users
 */
export async function fetchUserEngagementMetrics(params?: TimeRangeParams): Promise<any> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/engagement${queryString}`;
  return fetchWithAuth<any>(url);
}

/**
 * Fetch endpoint performance analytics
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise with endpoint performance analytics including response times, error rates, and trends
 */
export async function fetchEndpointPerformanceMetrics(params?: TimeRangeParams): Promise<any> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/endpoints${queryString}`;
  return fetchWithAuth<any>(url);
}

/**
 * Fetch conversation quality analytics
 * 
 * @param params - Optional time range parameters (startDate, endDate, preset)
 * @returns Promise with conversation quality analytics including completion rates, duration, and multi-turn breakdown
 */
export async function fetchConversationQualityMetrics(params?: TimeRangeParams): Promise<any> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `${ADMIN_BASE_URL}/quality${queryString}`;
  return fetchWithAuth<any>(url);
}

/**
 * Fetch live/real-time data
 * 
 * @returns Promise with live data including active sessions, active conversations, message rate, and token rate
 */
export async function fetchLiveData(): Promise<any> {
  const url = `${ADMIN_BASE_URL}/live`;
  return fetchWithAuth<any>(url);
}

/**
 * Export dashboard data in specified format
 * 
 * @param params - Export parameters including format (csv/json), time range, and metrics to include
 * @returns Promise<Blob> - File blob for download
 */
export async function exportDashboardData(params: ExportParams): Promise<Blob> {
  const url = `${ADMIN_BASE_URL}/export`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/login';
        throw new Error('Authentication required');
      } else if (response.status === 403) {
        throw new Error('Access denied. Administrator privileges required.');
      } else if (response.status === 429) {
        throw new Error('Too many requests. Please wait a moment.');
      } else {
        throw new Error('Failed to export data');
      }
    }

    return response.blob();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred during export');
  }
}

/**
 * Download exported data as a file
 * 
 * @param blob - File blob to download
 * @param filename - Name for the downloaded file
 */
export function downloadExportedData(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Helper function to format date for API requests
 * 
 * @param date - Date object to format
 * @returns ISO 8601 formatted date string
 */
export function formatDateForAPI(date: Date): string {
  return date.toISOString();
}

/**
 * Helper function to get preset time range dates
 * 
 * @param preset - Time range preset (today, last7days, last30days, last90days)
 * @returns Object with start and end dates
 */
export function getPresetTimeRange(preset: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = formatDateForAPI(now);
  let startDate: Date;

  switch (preset) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'last7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'last30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'last90days':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
  }

  return {
    startDate: formatDateForAPI(startDate),
    endDate,
  };
}
