import React from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { SystemRoles } from 'librechat-data-provider';
import GlobalFileManager from '~/components/Files/GlobalFileManager';

export default function Admin() {
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  if (!isAdmin) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-2 p-4">
        <div className="text-center text-gray-500">
          <p>Only administrators can access this section.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Admin Settings</h2>
        <p className="text-sm text-gray-500">
          Manage global files and system-wide settings.
        </p>
      </div>
      
      <GlobalFileManager />
    </div>
  );
}
