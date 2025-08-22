import React from 'react';
import { Button } from '~/components/ui/Button';
import { useNavigate } from 'react-router-dom';

export default function AdminLogs() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">System Logs</h2>
        <Button variant="outline" onClick={() => navigate('/c/new')}>
          Back to Chat
        </Button>
      </div>

      <div className="text-sm text-gray-500">
        {/* Placeholder: later we’ll add a DataTable for logs */}
        Logs will appear here...
      </div>
    </div>
  );
}
