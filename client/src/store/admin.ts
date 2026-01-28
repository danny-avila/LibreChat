import { atom } from 'recoil';

// Admin user type for state management
export interface AdminSelectedUser {
  _id: string;
  email: string;
  username?: string;
  name?: string;
  role: string;
  provider?: string;
  createdAt: string;
  emailVerified?: boolean;
  avatar?: string;
}

// Selected user for admin to view conversations
const adminSelectedUser = atom<AdminSelectedUser | null>({
  key: 'adminSelectedUser',
  default: null,
});

// Flag to control admin view mode in sidebar
const isAdminViewMode = atom<boolean>({
  key: 'isAdminViewMode',
  default: false,
});

export default {
  adminSelectedUser,
  isAdminViewMode,
};
