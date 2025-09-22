import React from 'react';
import { Button } from '~/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { Users, FileText } from 'lucide-react'; // <-- import icons

export default function AdminPanel() {
  const navigate = useNavigate();

  // Function to handle navigation and store the previous URL
  const handleNavigation = (path) => {
    // Store the current URL before navigating
    sessionStorage.setItem('previousPage', window.location.pathname);
    // Navigate to the new path
    navigate(path);
  };

  return (
    <div className="flex flex-col gap-2 p-2 text-sm">
      <div className="flex flex-col gap-2">
        {/* Users Button */}
        <Button
          type="button"
          className="flex h-10 w-full items-center justify-start gap-3 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-black ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => handleNavigation('/admin')}
        >
          <Users className="h-5 w-5" />
          Users
        </Button>

        {/* Logs Button */}
        <Button
          type="button"
          className="flex h-10 w-full items-center justify-start gap-3 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-black ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => handleNavigation('/admin/logs')}
        >
          <FileText className="h-5 w-5" />
          Logs
        </Button>

        {/* Query Logs Button */}
        <Button
          type="button"
          className="flex h-10 w-full items-center justify-start gap-3 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-black ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => handleNavigation('/admin/query-logs')}
        >
          <FileText className="h-5 w-5" />
          Query Logs
        </Button>
      </div>
    </div>
  );
}
