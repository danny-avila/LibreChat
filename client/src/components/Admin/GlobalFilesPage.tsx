import React from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { SystemRoles } from 'librechat-data-provider';
import GlobalFileManager from '~/components/Files/GlobalFileManager';

export default function GlobalFilesPage() {
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">Only administrators can access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Global File Management</h1>
        <p className="text-gray-600">
          Upload and manage PDF files that are globally accessible to all users in RAG queries.
        </p>
      </div>
      
      <GlobalFileManager />
    </div>
  );
}
