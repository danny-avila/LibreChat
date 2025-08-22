import React from 'react';
import { Button } from '~/components/ui/Button';
import { useNavigate } from 'react-router-dom';

export default function AdminPanel() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-3 p-2 text-sm">
      <h3 className="text-base font-semibold">Admin</h3>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate('/admin')}>
          Users
        </Button>
        <Button variant="outline" onClick={() => navigate('/admin/logs')}>
          Logs
        </Button>
      </div>
    </div>
  );
}
