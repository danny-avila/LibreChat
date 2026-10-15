import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Spinner } from '@librechat/client';
import { Activity, Cloud, Download, Folder, RefreshCw, Sparkles } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useAuthContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Summary = {
  lifetime_tokens?: number;
  peak_day_tokens?: number;
  active_days?: number;
  longest_streak?: number;
  current_streak?: number;
  longest_session_ms?: number;
  estimated_cost_microusd?: number;
};
type Daily = { date: string; tokens: number };
type ModelUsage = { name: string; provider: string; tokens: number; events: number };
type ProjectUsage = {
  name: string;
  project_key: string;
  tokens: number;
  sessions: number;
  last_used_at?: string;
};
type SourceUsage = { source: string; tokens: number; events: number; last_used_at?: string };
type Dashboard = {
  summary?: Summary;
  token_breakdown?: Record<string, number>;
  daily?: Daily[];
  models?: ModelUsage[];
  projects?: ProjectUsage[];
  sources?: SourceUsage[];
};

function compact(value = 0) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

function duration(ms = 0) {
  if (!ms) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function sourceLabel(value: string) {
  if (value === 'claude_code') return 'Claude Code';
  if (value === 'codex') return 'Codex';
  if (value === 'meo') return 'Meo AI';
  if (value === 'opencode') return 'OpenCode';
  if (value === 'cline') return 'Cline';
  return value || 'Other';
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'border-border-light bg-surface-primary rounded-2xl border shadow-sm',
        className,
      )}
    >
      {children}
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <Card className="min-w-0 p-4">
      <div className="text-text-primary text-xl font-semibold tracking-tight">{value}</div>
      <div className="text-text-secondary mt-1 truncate text-xs">{label}</div>
    </Card>
  );
}

function ActivityHeatmap({ daily }: { daily: Daily[] }) {
  const localize = useLocalize();
  const recent = daily.slice(-154);
  const max = Math.max(1, ...recent.map((item) => item.tokens));
  return (
    <div
      className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1"
      aria-label={localize('meo_activity_tokens')}
    >
      {recent.map((item) => {
        const ratio = item.tokens / max;
        let opacity = 'opacity-100';
        if (item.tokens === 0) opacity = 'opacity-20';
        else if (ratio < 0.08) opacity = 'opacity-30';
        else if (ratio < 0.24) opacity = 'opacity-50';
        else if (ratio < 0.5) opacity = 'opacity-75';
        return (
          <div
            key={item.date}
            title={`${item.date} · ${localize('meo_activity_token_count', { value: compact(item.tokens) })}`}
            className={cn('bg-text-primary size-3 rounded-sm', opacity)}
          />
        );
      })}
    </div>
  );
}

function UsageBars({ items }: { items: ModelUsage[] }) {
  const max = Math.max(1, ...items.map((item) => item.tokens));
  return (
    <div className="space-y-4">
      {items.slice(0, 7).map((item) => (
        <div key={`${item.provider}:${item.name}`}>
          <div className="mb-1.5 flex items-center gap-3 text-sm">
            <span className="text-text-primary min-w-0 flex-1 truncate">{item.name}</span>
            <span className="text-text-secondary shrink-0 tabular-nums">
              {compact(item.tokens)}
            </span>
          </div>
          <div className="bg-surface-tertiary h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-text-primary h-full w-[var(--meo-usage-width)] rounded-full transition-all duration-300 motion-reduce:transition-none"
              style={
                {
                  '--meo-usage-width': `${Math.max(2, (item.tokens / max) * 100)}%`,
                } as CSSProperties
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ActivityView() {
  const localize = useLocalize();
  const { token } = useAuthContext();
  const [data, setData] = useState<Dashboard>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    if (!token) {
      setError(localize('meo_activity_sign_in'));
      setLoading(false);
      return;
    }
    try {
      const response = await fetch('/api/user/meo-activity?days=365', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => ({}))) as Dashboard & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || `Meo activity returned ${response.status}`);
      setData(payload);
    } catch {
      setError(localize('meo_activity_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [token, localize]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = data?.summary ?? {};
  const models = data?.models ?? [];
  const projects = data?.projects ?? [];
  const sources = useMemo(() => data?.sources ?? [], [data?.sources]);
  const daily = data?.daily ?? [];
  const sourceTokens = useMemo(
    () => sources.reduce((total, source) => total + Number(source.tokens || 0), 0),
    [sources],
  );

  return (
    <main className="bg-surface-primary h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
        <header className="mb-7 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-text-secondary mb-2 flex items-center gap-2 text-sm">
              <Sparkles className="size-4" aria-hidden="true" />
              {localize('meo_activity_brand')}
            </div>
            <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
              {localize('meo_ai_activity')}
            </h1>
            <p className="text-text-secondary mt-2 max-w-2xl text-sm leading-6">
              {localize('meo_activity_description')}
            </p>
          </div>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw
              className={cn('mr-2 size-4', loading && 'animate-spin motion-reduce:animate-none')}
            />
            {localize('meo_activity_refresh')}
          </Button>
        </header>

        {loading && !data && (
          <div className="flex min-h-80 items-center justify-center">
            <Spinner className="size-7" />
          </div>
        )}
        {!loading && error && !data && (
          <Card className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <Cloud className="text-text-secondary mb-4 size-8" aria-hidden="true" />
            <h2 className="text-text-primary font-medium">{localize('meo_activity_ready')}</h2>
            <p className="text-text-secondary mt-2 max-w-md text-sm leading-6">{error}</p>
          </Card>
        )}
        {(data || (!loading && !error)) && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric
                value={compact(summary.lifetime_tokens)}
                label={localize('meo_activity_lifetime')}
              />
              <Metric
                value={compact(summary.peak_day_tokens)}
                label={localize('meo_activity_peak')}
              />
              <Metric
                value={duration(summary.longest_session_ms)}
                label={localize('meo_activity_longest')}
              />
              <Metric
                value={String(summary.longest_streak ?? 0)}
                label={localize('meo_activity_best_streak')}
              />
              <Metric
                value={String(summary.current_streak ?? 0)}
                label={localize('meo_activity_current_streak')}
              />
            </div>

            <Card className="p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <Activity className="text-text-secondary size-4" aria-hidden="true" />
                <h2 className="text-text-primary flex-1 font-medium">
                  {localize('meo_activity_tokens')}
                </h2>
                <span className="text-text-secondary text-xs">
                  {localize('meo_activity_active_days', { count: summary.active_days ?? 0 })}
                </span>
              </div>
              {daily.length ? (
                <ActivityHeatmap daily={daily} />
              ) : (
                <p className="text-text-secondary text-sm">{localize('meo_activity_import')}</p>
              )}
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5 sm:p-6">
                <h2 className="text-text-primary mb-5 font-medium">
                  {localize('meo_activity_models')}
                </h2>
                {models.length ? (
                  <UsageBars items={models} />
                ) : (
                  <p className="text-text-secondary text-sm">
                    {localize('meo_activity_no_models')}
                  </p>
                )}
              </Card>
              <Card className="p-5 sm:p-6">
                <h2 className="text-text-primary mb-4 font-medium">
                  {localize('meo_activity_projects')}
                </h2>
                <div className="divide-border-light divide-y">
                  {projects.slice(0, 7).map((project) => (
                    <div
                      key={project.project_key || project.name}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="bg-surface-secondary flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <Folder className="text-text-secondary size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-text-primary truncate text-sm">{project.name}</div>
                        <div className="text-text-secondary text-xs">
                          {localize('meo_activity_sessions', { count: project.sessions ?? 0 })}
                        </div>
                      </div>
                      <div className="text-text-secondary text-sm tabular-nums">
                        {compact(project.tokens)}
                      </div>
                    </div>
                  ))}
                  {!projects.length && (
                    <p className="text-text-secondary text-sm">
                      {localize('meo_activity_no_projects')}
                    </p>
                  )}
                </div>
              </Card>
            </div>

            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-text-primary flex-1 font-medium">
                  {localize('meo_activity_sources')}
                </h2>
                <span className="text-text-secondary text-xs">
                  {localize('meo_activity_token_count', { value: compact(sourceTokens) })}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sources.map((source) => (
                  <div
                    key={source.source}
                    className="border-border-light bg-surface-secondary text-text-primary inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs"
                  >
                    <span className="bg-text-primary size-1.5 rounded-full" />
                    {sourceLabel(source.source)}
                    <span className="text-text-secondary">{compact(source.tokens)}</span>
                  </div>
                ))}
                {!sources.length && (
                  <span className="text-text-secondary text-sm">
                    {localize('meo_activity_source_hint')}
                  </span>
                )}
              </div>
              <div className="border-border-light text-text-secondary mt-5 flex items-start gap-2 border-t pt-4 text-xs leading-5">
                <Download className="mt-0.5 size-3.5 shrink-0" />
                {localize('meo_activity_sync_privacy')}
              </div>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
