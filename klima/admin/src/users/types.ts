import type { AdminUserSearchResult } from '@librechat/data-schemas';

/** The user a screen action targets, from either a balance row or a search hit. */
export interface SelectedUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

/** `GET /api/admin/users/search` answers with this envelope; it has no shared type yet. */
export interface AdminUserSearchResponse {
  users: AdminUserSearchResult[];
  total: number;
  capped: boolean;
}

/** `DELETE /api/admin/users/:id` answers `{ message }` on success. */
export interface AdminUserDeleteResponse {
  message: string;
}
