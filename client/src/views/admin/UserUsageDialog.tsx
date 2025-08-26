import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import { Input } from '~/components/ui/Input';
import { Button } from '~/components/ui/Button';
import { useQuery } from '@tanstack/react-query';
import { request, QueryKeys } from 'librechat-data-provider';

interface AdminUser {
  _id: string;
  email?: string;
  username?: string;
}

export const UserUsageDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AdminUser | null;
  invalidate: (from?: string, to?: string) => void;
}> = ({ open, onOpenChange, user, invalidate }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Usage: {user?.email || user?.username}</DialogTitle>
        </DialogHeader>
        {user ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <Button variant="neutral" onClick={() => invalidate(from, to)}>
                Apply
              </Button>
            </div>
            <UserUsage userId={user._id} from={from} to={to} />
          </div>
        ) : (
          <div className="text-muted-foreground">No user selected</div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Subcomponent
const UserUsage = ({ userId, from, to }: { userId: string; from?: string; to?: string }) => {
  const { data, isFetching } = useQuery({
    queryKey: [QueryKeys.roles, 'admin', 'usage', userId, from, to],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (from) q.set('from', `${from}T00:00:00.000Z`);
      if (to) q.set('to', `${to}T23:59:59.999Z`);
      return await request.get(`/api/admin/users/${userId}/usage${q.toString() ? `?${q.toString()}` : ''}`);
    },
  });

  const byModel = (data as any)?.byModel ?? [];
  const totals = (data as any)?.totals ?? { promptTokens: 0, completionTokens: 0, tokenValue: 0 };
  const maxTokens = byModel.reduce((m: number, r: any) => Math.max(m, r.totalTokens || 0), 0);

  return (
    <div className="flex flex-col gap-2">
      {isFetching && <div className="text-muted-foreground">Loading usage…</div>}
      {!isFetching && byModel.length === 0 && <div className="text-muted-foreground">No usage for selected range.</div>}
      {byModel.map((row: any) => (
        <div key={row.model} className="rounded-md border border-border-light p-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <div className="font-medium">{row.model}</div>
            <div className="text-muted-foreground">{row.totalTokens} tokens</div>
          </div>
          <div className="mb-2 h-2 w-full rounded bg-surface-secondary">
            <div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, (row.totalTokens / maxTokens) * 100)}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
            <div>Prompt: {row.promptTokens}</div>
            <div>Completion: {row.completionTokens}</div>
            <div>Total: {row.totalTokens}</div>
            <div>Value: {Math.round(row.tokenValue)}</div>
          </div>
        </div>
      ))}
      <div className="mt-3 text-sm text-muted-foreground">
        Totals — Prompt: {totals.promptTokens} · Completion: {totals.completionTokens} · Value: {Math.round(totals.tokenValue)}
      </div>
    </div>
  );
};
