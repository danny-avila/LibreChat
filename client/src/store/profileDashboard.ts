/**
 * Recoil state atom for Profile Dashboard modal
 */
import { atom } from 'recoil';

export interface ProfileDashboardState {
  isOpen: boolean;
}

/**
 * Global state for the Profile Dashboard modal
 * 
 * Controls modal open/close state for the dashboard overlay.
 * The dashboard remains a modal (not a route) to keep users in context.
 */
export const profileDashboardState = atom<ProfileDashboardState>({
  key: 'profileDashboardState',
  default: {
    isOpen: false,
  },
});
