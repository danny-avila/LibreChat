import React from 'react';
import { RecoilRoot, useSetRecoilState } from 'recoil';
import { render, screen } from '@testing-library/react';
import type { PtcTraceEntry } from '~/store/ptc';
import { ptcTraceByToolCallId } from '~/store/ptc';
import PtcToolTrace from '../PtcToolTrace';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, values?: Record<string, unknown>): string => {
      const translations: Record<string, string> = {
        com_ui_ptc_trace_title: 'Tool calls',
        com_ui_ptc_trace_running: 'running',
        com_ui_ptc_trace_failed: 'failed',
        com_ui_tool_name_code: 'Code',
      };
      if (key === 'com_ui_duration_seconds') {
        return `${values?.[0]}s`;
      }
      return translations[key] ?? key;
    },
}));

jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
jest.mock('~/hooks/MCP', () => ({ useMCPServerNames: () => ['github'] }));
jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils/toolLabels'),
  ...jest.requireActual('~/utils/runStepDuration'),
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

const TOOL_CALL_ID = 'call_ptc_1';

function renderTrace(entries: PtcTraceEntry[]) {
  const Seed = () => {
    const set = useSetRecoilState(ptcTraceByToolCallId(TOOL_CALL_ID));
    React.useEffect(() => {
      if (entries.length > 0) {
        set(entries);
      }
    }, [set]);
    return null;
  };

  return render(
    <RecoilRoot>
      <Seed />
      <PtcToolTrace toolCallId={TOOL_CALL_ID} />
    </RecoilRoot>,
  );
}

describe('PtcToolTrace', () => {
  it('renders nothing when the call made no inner tool calls', () => {
    const { container } = renderTrace([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each inner call with its arguments', () => {
    renderTrace([
      { callId: 'a', name: 'read_file', status: 'success', args: 'path=a.ts', durationMs: 1200 },
      { callId: 'b', name: 'write_file', status: 'running', args: 'path=b.ts' },
    ]);

    expect(screen.getByText('Tool calls')).toBeInTheDocument();
    expect(screen.getByText('read_file')).toBeInTheDocument();
    expect(screen.getByText('path=a.ts')).toBeInTheDocument();
    expect(screen.getByText('write_file')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('splits an MCP tool id into its server and tool name', () => {
    renderTrace([{ callId: 'a', name: 'search_code_mcp_github', status: 'running' }]);

    expect(screen.getByText('github')).toBeInTheDocument();
    expect(screen.getByText('search_code')).toBeInTheDocument();
  });

  it('shows a settled duration', () => {
    renderTrace([{ callId: 'a', name: 'read_file', status: 'success', durationMs: 1200 }]);

    expect(screen.getByText('1.2s')).toBeInTheDocument();
  });

  it('prints the failure message under the call that produced it', () => {
    renderTrace([
      { callId: 'a', name: 'write_file', status: 'error', args: 'path=/etc/x', error: 'Denied' },
    ]);

    expect(screen.getByText('path=/etc/x')).toBeInTheDocument();
    expect(screen.getByText('Denied')).toBeInTheDocument();
  });

  it('falls back to a generic failure label when no message came through', () => {
    renderTrace([{ callId: 'a', name: 'write_file', status: 'error' }]);

    expect(screen.getByText('failed')).toBeInTheDocument();
  });
});
