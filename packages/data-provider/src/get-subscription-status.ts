import request from './request';
import * as endpoints from './api-endpoints';

/**
 * Gets the current user's subscription status from the backend.
 * Returns: { status: string } (e.g., { status: 'active' } or { status: 'none' })
 */
export function getSubscriptionStatus(): Promise<{ status: string }> {
  return request.get(endpoints.user() + '/subscription-status');
}
