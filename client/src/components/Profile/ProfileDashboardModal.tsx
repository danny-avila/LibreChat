/**
 * ProfileDashboardModal Component
 * 
 * A full-screen modal that displays the Profile Dashboard (CEO/Employee/Customer).
 * Follows the same pattern as PDFBuilderModal for consistency.
 * 
 * Features:
 * - Full-screen with 16px margin on all sides
 * - Semi-transparent backdrop
 * - Closes with ESC key, × button, or backdrop click
 * - Theme-aware (dark/light mode)
 * - Body scroll locking when open
 * - Loads profile data only when modal is opened
 * 
 * @example
 * ```tsx
 * // Modal is controlled via Recoil state
 * const setProfileDashboard = useSetRecoilState(profileDashboardState);
 * 
 * // Open modal
 * setProfileDashboard({ isOpen: true });
 * 
 * // Component auto-renders based on state
 * <ProfileDashboardModal />
 * ```
 */

import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { X } from 'lucide-react';
import { profileDashboardState } from '~/store/profileDashboard';
import ProfileDashboard from './ProfileDashboard';
import useProfile from '~/hooks/useProfile';

export function ProfileDashboardModal() {
  const [state, setState] = useRecoilState(profileDashboardState);
  const { profile, isLoading, error } = useProfile();

  // ----------------------------------------
  // EVENT HANDLERS
  // ----------------------------------------

  /**
   * Close the modal
   */
  const handleClose = () => {
    setState({ isOpen: false });
  };

  // ----------------------------------------
  // LOCK BODY SCROLL WHEN MODAL IS OPEN
  // ----------------------------------------

  useEffect(() => {
    if (state.isOpen) {
      // Lock body scroll
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scroll
      document.body.style.overflow = '';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [state.isOpen]);

  // ----------------------------------------
  // ESC KEY HANDLER
  // ----------------------------------------

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.isOpen) {
        handleClose();
      }
    };

    if (state.isOpen) {
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [state.isOpen]);

  // ----------------------------------------
  // RENDER
  // ----------------------------------------

  if (!state.isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        style={{ zIndex: 998 }}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal Container - Full screen with margin */}
      <div
        className="rounded-2xl border-4 border-white bg-white shadow-2xl dark:border-white dark:bg-gray-900 dark:shadow-black/50"
        style={{
          position: 'fixed',
          inset: '16px', // 16px margin on all sides
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          {/* Title */}
          <h2
            id="dashboard-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            📊 Dashboard
          </h2>

          {/* Close Button */}
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Close Dashboard"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body - Dashboard Content */}
        <div className="flex-1 overflow-y-auto">
          <ProfileDashboard 
            profile={profile} 
            isLoading={isLoading} 
            error={error} 
          />
        </div>
      </div>
    </>
  );
}
