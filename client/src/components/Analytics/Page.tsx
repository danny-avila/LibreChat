import { useMemo, useState } from 'react';
import { Button, Input } from '@librechat/client';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useLocalize } from '~/hooks';
import {
  useGetInteractionAnalyticsQuery,
  useSendMockInteractionMutation,
} from '~/data-provider/Analytics';

const defaultPrompt = 'Hello mock AI';

export default function AnalyticsPage() {
  const localize = useLocalize();
  const [prompt, setPrompt] = useState(defaultPrompt);

  const { data, refetch, isLoading } = useGetInteractionAnalyticsQuery({});
  const mockMutation = useSendMockInteractionMutation();

  const maxCount = useMemo(() => {
    if (!data?.series?.length) {
      return 1;
    }
    return Math.max(...data.series.map((item) => item.count), 1);
  }, [data?.series]);

  const onSendMock = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    await mockMutation.mutateAsync({ prompt: trimmed });
    await refetch();
  };

  return (
    <div className="h-full overflow-auto p-6 text-text-primary">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <h1 className="text-2xl font-semibold">
          {localize('com_ui_analytics' as TranslationKeys) || 'Interaction Analytics'}
        </h1>
        <div className="flex flex-col gap-3 rounded-xl border border-border-light bg-surface-primary p-4">
          <label htmlFor="mock-prompt" className="text-sm font-medium">
            {'Mock prompt'}
          </label>
          <div className="flex gap-2">
            <Input
              id="mock-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type prompt for mock interaction"
            />
            <Button
              onClick={onSendMock}
              disabled={mockMutation.isLoading || prompt.trim().length === 0}
            >
              {mockMutation.isLoading ? 'Sending...' : 'Send mock interaction'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border-light bg-surface-primary p-4">
            <div className="text-sm text-text-secondary">Total</div>
            <div className="text-2xl font-semibold">{data?.summary.total ?? 0}</div>
          </div>
          <div className="rounded-xl border border-border-light bg-surface-primary p-4">
            <div className="text-sm text-text-secondary">Success rate</div>
            <div className="text-2xl font-semibold">{data?.summary.successRate ?? 0}%</div>
          </div>
          <div className="rounded-xl border border-border-light bg-surface-primary p-4">
            <div className="text-sm text-text-secondary">Avg latency</div>
            <div className="text-2xl font-semibold">{data?.summary.avgLatencyMs ?? 0} ms</div>
          </div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-primary p-4">
          <h2 className="mb-4 text-lg font-semibold">Interactions by day</h2>
          <div className="flex items-end gap-2 overflow-x-auto pb-2">
            {(data?.series ?? []).map((item) => {
              const height = Math.max(Math.round((item.count / maxCount) * 120), 8);
              return (
                <div key={item.date} className="flex min-w-[50px] flex-col items-center gap-1">
                  <div className="text-xs text-text-secondary">{item.count}</div>
                  <div
                    className="w-8 rounded-t-md bg-blue-500"
                    style={{ height: `${height}px` }}
                    title={`${item.date}: ${item.count}`}
                  />
                  <div className="text-[10px] text-text-secondary">{item.date.slice(5)}</div>
                </div>
              );
            })}
            {(!data?.series || data.series.length === 0) && (
              <div className="text-sm text-text-secondary">No interactions yet</div>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-primary p-4">
          <h2 className="mb-3 text-lg font-semibold">Recent interactions</h2>
          {isLoading ? (
            <div className="text-sm text-text-secondary">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light text-left">
                    <th className="px-2 py-2">Time</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Latency</th>
                    <th className="px-2 py-2">Prompt len</th>
                    <th className="px-2 py-2">Response len</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent ?? []).map((row) => (
                    <tr key={`${row.createdAt}-${row.latencyMs}`} className="border-b border-border-light">
                      <td className="px-2 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="px-2 py-2">{row.status}</td>
                      <td className="px-2 py-2">{row.latencyMs} ms</td>
                      <td className="px-2 py-2">{row.promptLength}</td>
                      <td className="px-2 py-2">{row.responseLength}</td>
                    </tr>
                  ))}
                  {(!data?.recent || data.recent.length === 0) && (
                    <tr>
                      <td className="px-2 py-3 text-text-secondary" colSpan={5}>
                        No records
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}