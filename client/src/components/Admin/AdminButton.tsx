import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { Button } from '~/components/ui/Button';
import { useAuthContext } from '~/hooks/AuthContext';
import { SystemRoles } from 'librechat-data-provider';
import GlobalFilesModal from './GlobalFilesModal';

export default function AdminButton() {
  const { user } = useAuthContext();
  const [showGlobalFiles, setShowGlobalFiles] = useState(false);
  
  const isAdmin = user?.role === SystemRoles.ADMIN;

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowGlobalFiles(true)}
        className="flex items-center gap-2"
        title="Global File Management"
      >
        <Shield className="h-4 w-4" />
        <span className="hidden sm:inline">Global Files</span>
      </Button>
      
      <GlobalFilesModal open={showGlobalFiles} onOpenChange={setShowGlobalFiles} />
    </>
  );
} 