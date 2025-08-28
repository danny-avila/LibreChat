import React from 'react';
import { Button } from '~/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { Users, FileText } from 'lucide-react'; // <-- import icons

export default function AdminPanel() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-2 p-2 text-sm">
      <h3 className="text-base font-semibold">Admin Panel</h3>

      <div className="flex flex-col gap-2">
        {/* Users Button */}
        <Button
          type="button"
          className="flex h-10 w-full items-center justify-start gap-3 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-black ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => navigate('/admin')}
        >
          <Users className="h-5 w-5" /> {/* Users Icon */}
          Users
        </Button>

        {/* Logs Button */}
        <Button
          type="button"
          className="flex h-10 w-full items-center justify-start gap-3 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-black ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => navigate('/admin/logs')}
        >
          <FileText className="h-5 w-5" /> {/* Logs Icon */}
          Logs
        </Button>
      </div>
    </div>
  );
}
